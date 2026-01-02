/**
 * SyncSettings component tests
 * @requirements REQ-107
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SyncSettings from '../../components/SyncSettings';
import * as useSyncSettingsModule from '../../hooks/useSyncSettings';

// Mock the hook
vi.mock('../../hooks/useSyncSettings', () => ({
  useSyncSettings: vi.fn(),
}));

const mockUseSyncSettings = useSyncSettingsModule.useSyncSettings;

describe('REQ-107: Sync Admin UI', () => {
  const defaultMockValues = {
    settings: {
      enabled: false,
      interval_minutes: 60,
      last_sync_at: null,
      last_sync_status: null,
      last_sync_message: null,
    },
    syncLogs: [],
    loading: false,
    syncing: false,
    syncProgress: null,
    error: null,
    toggleEnabled: vi.fn(),
    setInterval: vi.fn(),
    triggerSync: vi.fn(),
    refresh: vi.fn(),
    SyncStatus: {
      RUNNING: 'running',
      SUCCESS: 'success',
      PARTIAL: 'partial',
      FAILED: 'failed',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSyncSettings.mockReturnValue(defaultMockValues);
  });

  describe('rendering', () => {
    it('renders External Sync section title', () => {
      render(<SyncSettings />);

      expect(screen.getByText('External Sync')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<SyncSettings />);

      expect(screen.getByText(/Automatically sync appointments/)).toBeInTheDocument();
    });

    it('shows loading state', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        loading: true,
      });

      render(<SyncSettings />);

      // Should show loading skeleton
      expect(screen.queryByText('External Sync')).not.toBeInTheDocument();
    });

    it('shows error message when error exists', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        error: 'Authentication failed',
      });

      render(<SyncSettings />);

      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });
  });

  describe('sync enable/disable toggle', () => {
    it('shows Automatic Sync toggle', () => {
      render(<SyncSettings />);

      expect(screen.getByText('Automatic Sync')).toBeInTheDocument();
    });

    it('calls toggleEnabled when toggle is clicked', () => {
      const toggleEnabled = vi.fn();
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        toggleEnabled,
      });

      render(<SyncSettings />);

      const toggle = screen.getByRole('button', { name: '' });
      fireEvent.click(toggle);

      expect(toggleEnabled).toHaveBeenCalled();
    });
  });

  describe('sync interval configuration', () => {
    it('shows interval dropdown', () => {
      render(<SyncSettings />);

      expect(screen.getByText('Sync Interval')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('shows current interval value', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        settings: { ...defaultMockValues.settings, interval_minutes: 120 },
      });

      render(<SyncSettings />);

      expect(screen.getByRole('combobox')).toHaveValue('120');
    });

    it('calls setInterval when interval changes', () => {
      const setInterval = vi.fn();
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        setInterval,
      });

      render(<SyncSettings />);

      fireEvent.change(screen.getByRole('combobox'), { target: { value: '30' } });

      expect(setInterval).toHaveBeenCalledWith(30);
    });
  });

  describe('last sync status display', () => {
    it('shows "Never" when no sync has occurred', () => {
      render(<SyncSettings />);

      expect(screen.getByText('Last Sync')).toBeInTheDocument();
      // There are multiple "Never" elements - use getAllByText
      expect(screen.getAllByText('Never').length).toBeGreaterThan(0);
    });

    it('shows success status badge', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        settings: {
          ...defaultMockValues.settings,
          last_sync_at: '2025-01-01T12:00:00Z',
          last_sync_status: 'success',
        },
      });

      render(<SyncSettings />);

      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('shows failed status badge', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        settings: {
          ...defaultMockValues.settings,
          last_sync_at: '2025-01-01T12:00:00Z',
          last_sync_status: 'failed',
        },
      });

      render(<SyncSettings />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('shows last sync message', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        settings: {
          ...defaultMockValues.settings,
          last_sync_message: 'Synced 5 appointments',
        },
      });

      render(<SyncSettings />);

      expect(screen.getByText('Synced 5 appointments')).toBeInTheDocument();
    });
  });

  describe('manual sync trigger', () => {
    it('shows Sync Now button', () => {
      render(<SyncSettings />);

      expect(screen.getByRole('button', { name: /Sync Now/i })).toBeInTheDocument();
    });

    it('calls triggerSync when button is clicked', async () => {
      const triggerSync = vi.fn().mockResolvedValue({});
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        triggerSync,
      });

      render(<SyncSettings />);

      fireEvent.click(screen.getByRole('button', { name: /Sync Now/i }));

      expect(triggerSync).toHaveBeenCalled();
    });

    it('disables button when syncing', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        syncing: true,
      });

      render(<SyncSettings />);

      expect(screen.getByRole('button', { name: /Syncing/i })).toBeDisabled();
    });

    it('shows progress message during sync', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        syncing: true,
        syncProgress: { stage: 'processing', current: 3, total: 10 },
      });

      render(<SyncSettings />);

      expect(screen.getByText(/Processing 3\/10/)).toBeInTheDocument();
    });
  });

  describe('sync history', () => {
    it('shows toggle for sync history', () => {
      render(<SyncSettings />);

      expect(screen.getByText('Show Sync History')).toBeInTheDocument();
    });

    it('toggles history visibility', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        syncLogs: [
          {
            id: '1',
            started_at: '2025-01-01T12:00:00Z',
            status: 'success',
            appointments_found: 5,
            appointments_created: 3,
            appointments_updated: 2,
            appointments_failed: 0,
            duration_ms: 5000,
          },
        ],
      });

      render(<SyncSettings />);

      // Initially hidden
      expect(screen.queryByText('Recent Syncs')).not.toBeInTheDocument();

      // Click to show
      fireEvent.click(screen.getByText('Show Sync History'));

      expect(screen.getByText('Recent Syncs')).toBeInTheDocument();
      expect(screen.getByText('Hide History')).toBeInTheDocument();
    });

    it('displays sync log entries', () => {
      mockUseSyncSettings.mockReturnValue({
        ...defaultMockValues,
        syncLogs: [
          {
            id: '1',
            started_at: '2025-01-01T12:00:00Z',
            status: 'success',
            appointments_found: 10,
            appointments_created: 5,
            appointments_updated: 4,
            appointments_failed: 1,
            duration_ms: 15000,
          },
        ],
      });

      render(<SyncSettings />);

      fireEvent.click(screen.getByText('Show Sync History'));

      expect(screen.getByText('Found: 10')).toBeInTheDocument();
      expect(screen.getByText('Created: 5')).toBeInTheDocument();
      expect(screen.getByText('Updated: 4')).toBeInTheDocument();
      expect(screen.getByText('Failed: 1')).toBeInTheDocument();
      expect(screen.getByText('Duration: 15.0s')).toBeInTheDocument();
    });

    it('shows empty state when no history', () => {
      render(<SyncSettings />);

      fireEvent.click(screen.getByText('Show Sync History'));

      expect(screen.getByText('No sync history yet')).toBeInTheDocument();
    });
  });
});
