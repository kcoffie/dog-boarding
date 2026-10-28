import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Nothing redeems an invite code since the sign-up page went (#301), so Settings
// doesn't make them; Kate adds accounts in Supabase (#307).
const from = vi.fn(() => ({ select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...args) => from(...args) } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' }, updatePassword: vi.fn() }) }));
vi.mock('../../context/DataContext', () => ({
  useData: () => ({
    settings: { netPercentage: 65, employees: [] },
    settingsLoading: false,
    sortEmployees: vi.fn(),
    nightAssignments: [],
  }),
}));
vi.mock('../../hooks/useCronHealth', () => ({ useCronHealth: () => ({ cronHealth: [], loading: false }) }));
vi.mock('../../components/SiteAccessCard', () => ({ default: () => null }));
vi.mock('../../components/SyncSettings', () => ({ default: () => null }));

import SettingsPage from '../../pages/SettingsPage';

/**
 * @requirements REQ-006
 */
describe('REQ-006: Settings has no invite codes (#307)', () => {
  beforeEach(() => from.mockClear());

  it('shows no Invite Users section, no Generate button and no invite list', () => {
    render(<BrowserRouter><SettingsPage /></BrowserRouter>);
    expect(screen.getByText('Change Password')).toBeInTheDocument();
    expect(screen.queryByText('Invite Users')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/email/i)).not.toBeInTheDocument();
  });

  it('never reads the invite_codes table', () => {
    render(<BrowserRouter><SettingsPage /></BrowserRouter>);
    expect(from).not.toHaveBeenCalledWith('invite_codes');
  });
});
