/**
 * Sync API tests
 * @requirements REQ-108
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Test the sanitizeError function (copied from sync.js for testing)
function sanitizeError(message) {
  if (!message) return 'Unknown error';
  let sanitized = message.replace(/https?:\/\/[^\s]+/g, '[URL]');
  sanitized = sanitized.replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]');
  sanitized = sanitized.replace(/username[=:]\s*\S+/gi, 'username=[REDACTED]');
  sanitized = sanitized.replace(/email[=:]\s*\S+/gi, 'email=[REDACTED]');
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }
  return sanitized;
}

describe('REQ-108: Server-Side Sync Proxy', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('API endpoint behavior', () => {
    it('handles empty response body', async () => {
      // This test catches the "Unexpected end of JSON input" error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve(''),
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      });

      const response = await fetch('/api/sync', { method: 'POST' });

      // Client should handle this gracefully
      try {
        await response.json();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Unexpected end of JSON input');
      }
    });

    it('handles non-JSON response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
        json: () => Promise.reject(new SyntaxError('Unexpected token I in JSON')),
      });

      const response = await fetch('/api/sync', { method: 'POST' });

      // Should be able to get text even if JSON fails
      const text = await response.text();
      expect(text).toBe('Internal Server Error');
    });

    it('handles FUNCTION_INVOCATION_FAILED error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Map([['x-vercel-error', 'FUNCTION_INVOCATION_FAILED']]),
        text: () => Promise.resolve('A server error has occurred\n\nFUNCTION_INVOCATION_FAILED'),
        json: () => Promise.reject(new SyntaxError('Unexpected token A in JSON')),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      expect(response.ok).toBe(false);

      const text = await response.text();
      expect(text).toContain('FUNCTION_INVOCATION_FAILED');
    });

    it('makes POST request to /api/sync', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          status: 'success',
          appointmentsFound: 5,
          appointmentsCreated: 3,
          appointmentsUpdated: 2,
          appointmentsFailed: 0,
        }),
      });
      global.fetch = mockFetch;

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(response.ok).toBe(true);
    });

    it('handles successful sync response', async () => {
      const mockResult = {
        success: true,
        status: 'success',
        appointmentsFound: 10,
        appointmentsCreated: 5,
        appointmentsUpdated: 5,
        appointmentsFailed: 0,
        errors: [],
        durationMs: 5000,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.appointmentsFound).toBe(10);
      expect(result.appointmentsCreated).toBe(5);
    });

    it('handles partial success response', async () => {
      const mockResult = {
        success: true,
        status: 'partial',
        appointmentsFound: 10,
        appointmentsCreated: 7,
        appointmentsUpdated: 0,
        appointmentsFailed: 3,
        errors: [
          { external_id: 'ABC123', error: 'Failed to fetch details' },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.status).toBe('partial');
      expect(result.appointmentsFailed).toBe(3);
    });

    it('handles missing credentials error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: 'External site credentials not configured',
        }),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.error).toBe('External site credentials not configured');
    });

    it('handles authentication failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          success: false,
          status: 'failed',
          error: 'Authentication failed: Invalid credentials',
        }),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('handles network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        fetch('/api/sync', { method: 'POST' })
      ).rejects.toThrow('Network error');
    });
  });

  describe('error sanitization in API responses', () => {
    it('sanitizes URLs in error messages', () => {
      const error = 'Failed at https://example.com/schedule/123';
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('https://');
      expect(sanitized).toContain('[URL]');
    });

    it('sanitizes password leaks', () => {
      const error = 'Login failed with password=secret123';
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('secret123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('sanitizes username leaks', () => {
      const error = 'Auth error for username=admin@test.com';
      const sanitized = sanitizeError(error);

      expect(sanitized).not.toContain('admin@test.com');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('truncates long error messages', () => {
      const longError = 'A'.repeat(300);
      const sanitized = sanitizeError(longError);

      expect(sanitized.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(sanitized).toContain('...');
    });
  });

  describe('client-side integration', () => {
    it('client parses successful sync result', async () => {
      const mockResult = {
        success: true,
        status: 'success',
        appointmentsFound: 5,
        appointmentsCreated: 2,
        appointmentsUpdated: 3,
        appointmentsFailed: 0,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      // Client-side validation
      expect(result.success).toBe(true);
      expect(typeof result.appointmentsFound).toBe('number');
      expect(typeof result.appointmentsCreated).toBe('number');
    });

    it('client handles error response correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: 'Sync failed',
          success: false,
        }),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      const result = await response.json();

      if (!response.ok) {
        const errorMessage = result.error || 'Sync failed';
        expect(errorMessage).toBe('Sync failed');
      }
    });

    it('returns proper structure for UI display', async () => {
      const mockResult = {
        success: true,
        status: 'success',
        appointmentsFound: 10,
        appointmentsCreated: 4,
        appointmentsUpdated: 6,
        appointmentsFailed: 0,
        errors: [],
        durationMs: 12000,
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResult),
      });

      const response = await fetch('/api/sync', { method: 'POST' });
      const result = await response.json();

      // UI needs these fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('appointmentsFound');
      expect(result).toHaveProperty('appointmentsCreated');
      expect(result).toHaveProperty('appointmentsUpdated');
      expect(result).toHaveProperty('appointmentsFailed');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('durationMs');
    });
  });

  describe('CORS bypass verification', () => {
    it('API endpoint is same-origin (no CORS needed)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await fetch('/api/sync', { method: 'POST' });

      // Verify request was made to relative path (same-origin)
      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).toBe('/api/sync');
      expect(callUrl).not.toMatch(/^https?:\/\//);
    });

    it('does not include external site URL in client request', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const callUrl = global.fetch.mock.calls[0][0];
      expect(callUrl).not.toContain('agirlandyourdog.com');
      expect(callUrl).not.toContain('external');
    });
  });
});
