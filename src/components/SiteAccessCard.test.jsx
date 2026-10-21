import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const getSession = vi.fn(async () => ({ data: { session: { access_token: 'jwt-1' } } }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: () => getSession() } } }));

const { default: SiteAccessCard } = await import('./SiteAccessCard');

const fetchFn = vi.fn();
const answer = (status, body) => ({ ok: status < 300, status, json: async () => body });
const BLOCKED = { blocked: true, reason: 'it refused the login', since: '2026-10-22T00:05:00.000Z' };

beforeEach(() => {
  fetchFn.mockReset();
  vi.stubGlobal('fetch', fetchFn);
});

/**
 * Settings shows the booking-site breaker, and Clear calls POST /api/site-access (#324).
 * @requirements REQ-657
 */
describe('REQ-657: SiteAccessCard', () => {
  it('blocked: shows the reason and a Clear button', async () => {
    fetchFn.mockResolvedValue(answer(200, BLOCKED));
    render(<SiteAccessCard />);
    expect(await screen.findByText(/Booking site blocked since .*: it refused the login/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('not blocked: says OK and offers no Clear', async () => {
    fetchFn.mockResolvedValue(answer(200, { blocked: false, reason: null, since: null, hasSession: true }));
    render(<SiteAccessCard />);
    expect(await screen.findByText('OK: the sync can reach the booking site.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it("reads the status with the signed-in user's token", async () => {
    fetchFn.mockResolvedValue(answer(200, BLOCKED));
    render(<SiteAccessCard />);
    await screen.findByRole('button', { name: 'Clear' });
    expect(fetchFn).toHaveBeenCalledWith('/api/site-access', { method: 'GET', headers: { Authorization: 'Bearer jwt-1' } });
  });

  it('Clear posts, says it signed in, and reloads the status', async () => {
    fetchFn
      .mockResolvedValueOnce(answer(200, BLOCKED))
      .mockResolvedValueOnce(answer(200, { ok: true, loggedIn: true }))
      .mockResolvedValueOnce(answer(200, { blocked: false, reason: null, since: null, hasSession: true }));
    render(<SiteAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Cleared and signed in to the booking site.')).toBeInTheDocument();
    expect(fetchFn.mock.calls[1]).toEqual(['/api/site-access', { method: 'POST', headers: { Authorization: 'Bearer jwt-1' } }]);
    await waitFor(() => expect(screen.getByText('OK: the sync can reach the booking site.')).toBeInTheDocument());
  });

  it("a refused login after Clear shows the server's reason", async () => {
    fetchFn
      .mockResolvedValueOnce(answer(200, BLOCKED))
      .mockResolvedValueOnce(answer(502, { ok: false, loggedIn: false, error: 'Authentication failed: Invalid credentials' }))
      .mockResolvedValueOnce(answer(200, BLOCKED));
    render(<SiteAccessCard />);
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Cleared, but the sign-in failed: Authentication failed: Invalid credentials')).toBeInTheDocument();
  });

  it('not blocked but no session: says the sync waits for the nightly sign-in, not OK', async () => {
    fetchFn.mockResolvedValue(answer(200, { blocked: false, reason: null, since: null, hasSession: false }));
    render(<SiteAccessCard />);
    expect(await screen.findByText(/no booking-site session yet/)).toBeInTheDocument();
    expect(screen.queryByText('OK: the sync can reach the booking site.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
  });

  it("a status that can't be read says so", async () => {
    fetchFn.mockResolvedValue(answer(500, { ok: false, error: 'Could not read or update the booking-site status' }));
    render(<SiteAccessCard />);
    expect(await screen.findByText(/Couldn.t read the booking-site status: Could not read or update the booking-site status/)).toBeInTheDocument();
  });
});
