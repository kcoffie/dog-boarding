/**
 * Authentication module tests
 * @requirements REQ-100
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authenticate,
  isAuthenticated,
  clearSession,
  setSession,
  getSessionCookies,
} from '../../lib/scraper/auth.js';
import { mockLoginPage } from './fixtures.js';

// Mock global fetch
/* global global */
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
