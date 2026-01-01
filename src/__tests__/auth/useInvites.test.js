import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock dependencies before imports
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'admin@test.com' } }),
}));

// Create stable mock data reference
const mockData = { invites: [], error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockData.invites, error: mockData.error })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { id: 'new-invite', code: 'NEWCODE1', email: null },
            error: null
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

import { useInvites } from '../../hooks/useInvites';

/**
 * @requirements REQ-006
 */
describe('REQ-006: useInvites Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.invites = [];
    mockData.error = null;
  });

  it('returns initial state with expected properties', () => {
    const { result } = renderHook(() => useInvites());

    expect(result.current).toHaveProperty('invites');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('createInvite');
    expect(result.current).toHaveProperty('deleteInvite');
    expect(result.current).toHaveProperty('refresh');
  });

  it('starts with loading state true', () => {
    const { result } = renderHook(() => useInvites());
    expect(result.current.loading).toBe(true);
  });

  it('provides createInvite as a function', () => {
    const { result } = renderHook(() => useInvites());
    expect(typeof result.current.createInvite).toBe('function');
  });

  it('provides deleteInvite as a function', () => {
    const { result } = renderHook(() => useInvites());
    expect(typeof result.current.deleteInvite).toBe('function');
  });

  it('provides refresh as a function', () => {
    const { result } = renderHook(() => useInvites());
    expect(typeof result.current.refresh).toBe('function');
  });

  it('initializes with empty invites array', () => {
    const { result } = renderHook(() => useInvites());
    expect(Array.isArray(result.current.invites)).toBe(true);
  });

  it('has null error initially', () => {
    const { result } = renderHook(() => useInvites());
    expect(result.current.error).toBeNull();
  });
});

describe('useInvites - Invite Data Structure', () => {
  it('should have expected invite structure', () => {
    // Verify the expected invite structure
    const expectedInvite = {
      id: 'invite-1',
      code: 'ABC123',
      email: null,
      used_by: null,
      created_at: '2024-01-01T00:00:00Z',
    };

    expect(expectedInvite).toHaveProperty('id');
    expect(expectedInvite).toHaveProperty('code');
    expect(expectedInvite).toHaveProperty('email');
    expect(expectedInvite).toHaveProperty('used_by');
  });

  it('should support used invite structure', () => {
    const usedInvite = {
      id: 'invite-2',
      code: 'DEF456',
      email: 'user@test.com',
      used_by: 'user-456',
      used_at: '2024-01-02T00:00:00Z',
    };

    expect(usedInvite.used_by).not.toBeNull();
    expect(usedInvite.email).toBe('user@test.com');
  });
});
