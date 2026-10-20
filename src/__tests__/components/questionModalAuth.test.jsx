/**
 * Send a Question, browser half: the request carries the signed-in user's access token and no
 * username (the server names the sender from the verified user).
 * @requirements REQ-656, REQ-700
 *
 * Boundaries faked: the Supabase client's getSession, useAuth, and fetch to /api/send-question.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getSession = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession } } }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'staff-a@example.com' }, signOut: vi.fn() }),
}));

const { default: Layout } = await import('../../components/Layout');

const fetchFn = vi.fn();

beforeEach(() => {
  fetchFn.mockReset();
  fetchFn.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchFn);
  getSession.mockResolvedValue({ data: { session: { access_token: 'jwt-1' } } });
});

async function sendQuestion(text) {
  render(<MemoryRouter><Layout /></MemoryRouter>);
  fireEvent.click(screen.getByLabelText('Toggle menu'));
  fireEvent.click(screen.getAllByText('Send a Question')[0]);
  fireEvent.change(screen.getByPlaceholderText('Type your question or comment...'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(fetchFn).toHaveBeenCalled());
  return fetchFn.mock.calls[0];
}

describe('REQ-656: Send a Question sends the user token, not a username', () => {
  it("posts to /api/send-question with the session's access token as the Bearer header", async () => {
    const [url, init] = await sendQuestion('Is the van free Friday?');
    expect(url).toBe('/api/send-question');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer jwt-1');
  });

  it('the body holds only the trimmed message, never a username', async () => {
    const [, init] = await sendQuestion('  Is the van free Friday?  ');
    expect(JSON.parse(init.body)).toEqual({ message: 'Is the van free Friday?' });
  });
});
