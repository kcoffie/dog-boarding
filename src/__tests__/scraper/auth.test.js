/**
 * Authentication module tests
 * @requirements REQ-100, REQ-402, REQ-640
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authenticate,
  authenticatedFetch,
  isAuthenticated,
  clearSession,
  setSession,
  getSessionCookies,
  SiteThrottled,
} from '../../lib/scraper/auth.js';
import { SCRAPER_CONFIG } from '../../lib/scraper/config.js';
import { mockLoginPage } from './fixtures.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('REQ-100: External Source Authentication', () => {
  beforeEach(() => {
    clearSession();
    mockFetch.mockReset();
  });

  afterEach(() => {
    clearSession();
  });

  describe('authenticate()', () => {
    it('returns error when username is missing', async () => {
      const result = await authenticate('', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username and password are required');
    });

    it('returns error when password is missing', async () => {
      const result = await authenticate('user@example.com', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Username and password are required');
    });

    it('successfully authenticates with valid credentials', async () => {
      // Mock login page fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'set-cookie': 'session=abc123' }),
        text: () => Promise.resolve(mockLoginPage),
      });

      // Mock login POST - successful redirect
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 302,
        headers: new Headers({ 'set-cookie': 'auth=xyz789; session=abc123' }),
        text: () => Promise.resolve(''),
      });

      const result = await authenticate('user@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.cookies).toContain('session');
    });

    it('extracts CSRF token from login page', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve(mockLoginPage),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: new Headers({ 'set-cookie': 'auth=xyz' }),
        text: () => Promise.resolve(''),
      });

      await authenticate('user@example.com', 'password');

      // Check that the POST included the CSRF token
      const postCall = mockFetch.mock.calls[1];
      expect(postCall[1].body).toContain('_token=test-csrf-token-123');
    });

    it('returns error on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve(mockLoginPage),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: () => Promise.resolve('Invalid credentials'),
      });

      const result = await authenticate('bad@example.com', 'wrongpass');

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authenticate('user@example.com', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication error');
      expect(result.error).toContain('Network error');
    });

    it('stores session after successful authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'set-cookie': 'session=initial' }),
        text: () => Promise.resolve(mockLoginPage),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: new Headers({ 'set-cookie': 'auth=authenticated' }),
        text: () => Promise.resolve(''),
      });

      await authenticate('user@example.com', 'password');

      expect(isAuthenticated()).toBe(true);
      expect(getSessionCookies()).toBeTruthy();
    });
  });

  describe('session management', () => {
    it('isAuthenticated() returns false when no session', () => {
      expect(isAuthenticated()).toBe(false);
    });

    it('isAuthenticated() returns true after setSession()', () => {
      setSession('test-cookie=value');

      expect(isAuthenticated()).toBe(true);
    });

    it('clearSession() removes authentication', () => {
      setSession('test-cookie=value');
      expect(isAuthenticated()).toBe(true);

      clearSession();
      expect(isAuthenticated()).toBe(false);
    });

    it('getSessionCookies() returns null when not authenticated', () => {
      expect(getSessionCookies()).toBeNull();
    });

    it('getSessionCookies() returns cookies when authenticated', () => {
      setSession('my-cookie=my-value');

      expect(getSessionCookies()).toBe('my-cookie=my-value');
    });

    it('session expires after specified time', async () => {
      // Set session with very short expiry
      setSession('test=value', 1); // 1ms expiry

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(isAuthenticated()).toBe(false);
      expect(getSessionCookies()).toBeNull();
    });
  });

  describe('credentials security', () => {
    it('does not include credentials in error messages', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      const password = 'super-secret-password-123';
      const result = await authenticate('user@example.com', password);

      expect(result.error).not.toContain(password);
    });

    it('credentials are not logged (no console output)', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve(mockLoginPage),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 302,
        headers: new Headers(),
        text: () => Promise.resolve(''),
      });

      const password = 'my-secret-password';
      await authenticate('user@example.com', password);

      // Check no console output contains password
      for (const call of consoleSpy.mock.calls) {
        const output = call.join(' ');
        expect(output).not.toContain(password);
      }

      consoleSpy.mockRestore();
    });
  });
});

/**
 * @requirements REQ-657
 */
describe('REQ-657: booking-site requests are paced, and a 429/403 stops the run', () => {
  const URL = 'https://agirlandyourdog.com/schedule/a/ABC/1';
  const respond = (status) => ({ ok: status < 300, status, text: async () => '' });

  let days = 0;

  beforeEach(() => {
    SCRAPER_CONFIG.delayBetweenRequests = 1500;
    vi.useFakeTimers();
    // Each test a day past the last one's requests, so its first request goes at once
    days += 1;
    vi.setSystemTime(Date.now() + days * 86_400_000);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(respond(200));
    setSession('session=abc');
  });

  afterEach(() => {
    SCRAPER_CONFIG.delayBetweenRequests = 0;
    vi.useRealTimers();
    clearSession();
  });

  it('a rejected request does not hold up the next one', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    const first = authenticatedFetch(URL).catch(err => err);
    await vi.advanceTimersByTimeAsync(0);
    expect((await first).message).toBe('network down');

    const second = authenticatedFetch(URL);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await second).status).toBe(200);
  });

  it('a second request starts 1.5 s after the first, not before', async () => {
    const first = authenticatedFetch(URL);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const second = authenticatedFetch(URL);
    await vi.advanceTimersByTimeAsync(1499);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await Promise.all([first, second]);
  });

  it('two requests made at the same moment still start 1.5 s apart', async () => {
    const both = Promise.all([authenticatedFetch(URL), authenticatedFetch(URL)]);
    await vi.advanceTimersByTimeAsync(1499);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await both;
  });

  it('a 429 throws SiteThrottled', async () => {
    mockFetch.mockResolvedValue(respond(429));
    const result = authenticatedFetch(URL).catch(err => err);
    await vi.advanceTimersByTimeAsync(0);
    const err = await result;
    expect(err).toBeInstanceOf(SiteThrottled);
    expect(err.status).toBe(429);
  });

  it('a 403 throws SiteThrottled', async () => {
    mockFetch.mockResolvedValue(respond(403));
    const result = authenticatedFetch(URL).catch(err => err);
    await vi.advanceTimersByTimeAsync(0);
    const err = await result;
    expect(err).toBeInstanceOf(SiteThrottled);
    expect(err.status).toBe(403);
  });

  it('after a 429, the next request in the run throws without touching the site', async () => {
    mockFetch.mockResolvedValueOnce(respond(429));
    const first = authenticatedFetch(URL).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await first;

    await expect(authenticatedFetch(URL)).rejects.toBeInstanceOf(SiteThrottled);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('setSession starts a new run: requests go out again after a 429', async () => {
    mockFetch.mockResolvedValueOnce(respond(429));
    const first = authenticatedFetch(URL).catch(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await first;

    setSession('session=abc');
    const second = authenticatedFetch(URL);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await second).status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('a 500 does not stop the run', async () => {
    mockFetch.mockResolvedValueOnce(respond(500));
    const first = authenticatedFetch(URL);
    await vi.advanceTimersByTimeAsync(0);
    expect((await first).status).toBe(500);

    const second = authenticatedFetch(URL);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await second).status).toBe(200);
  });

  it('the login page and the login itself are paced too', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), text: async () => mockLoginPage })
      .mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers(), text: async () => '' });
    const login = authenticate('user@example.com', 'secret');
    await vi.advanceTimersByTimeAsync(1499);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await login).success).toBe(true);
  });
});
