import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock dependencies before imports
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'admin@test.com' } }),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockOrder = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({
        order: mockOrder,
      }),
      insert: () => ({
        select: () => ({
          single: mockSingle,
        }),
      }),
      delete: () => ({
        eq: mockEq,
      }),
    })),
  },
}));

import { useInvites } from '../../hooks/useInvites';

describe('useInvites Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrder.mockResolvedValue({ data: [], error: null });
    mockSingle.mockResolvedValue({ data: null, error: null });
    mockEq.mockResolvedValue({ error: null });
  });

  it('fetches invites on mount', async () => {
    const mockInvites = [
      { id: '1', code: 'ABC123', email: null, used_by: null },
      { id: '2', code: 'DEF456', email: 'test@test.com', used_by: 'user-456' },
    ];

    mockOrder.mockResolvedValueOnce({ data: mockInvites, error: null });

    const { result } = renderHook(() => useInvites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.invites).toEqual(mockInvites);
  });

  it('starts with loading state true', () => {
    const { result } = renderHook(() => useInvites());
    expect(result.current.loading).toBe(true);
  });

  it('returns empty array when no invites exist', async () => {
    mockOrder.mockResolvedValueOnce({ data: [], error: null });

    const { result } = renderHook(() => useInvites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.invites).toEqual([]);
  });

  it('handles fetch error gracefully', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'Network error' } });

    const { result } = renderHook(() => useInvites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.invites).toEqual([]);
  });

  it('creates invite and adds to list', async () => {
    const newInvite = { id: '3', code: 'XYZ789', email: null };
    mockSingle.mockResolvedValueOnce({ data: newInvite, error: null });

    const { result } = renderHook(() => useInvites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createInvite();
    });

    expect(result.current.invites).toContainEqual(newInvite);
  });

  it('deletes invite from list', async () => {
    const existingInvites = [
      { id: '1', code: 'ABC123' },
      { id: '2', code: 'DEF456' },
    ];

    mockOrder.mockResolvedValueOnce({ data: existingInvites, error: null });

    const { result } = renderHook(() => useInvites());

    await waitFor(() => {
      expect(result.current.invites).toHaveLength(2);
    });

    await act(async () => {
      await result.current.deleteInvite('1');
    });

    expect(result.current.invites).toHaveLength(1);
    expect(result.current.invites[0].id).toBe('2');
  });

  it('provides refresh function', async () => {
    const { result } = renderHook(() => useInvites());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refresh).toBe('function');
  });
});
