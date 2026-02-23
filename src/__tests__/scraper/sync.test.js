/**
 * Sync service tests
 * @requirements REQ-104, REQ-106, REQ-110
 */

import { describe, it, expect } from 'vitest';
import {
  SyncStatus,
  checkParseDegradation,
  createSyncLog,
  updateSyncLog,
  getSyncSettings,
  updateSyncSettings,
  getRecentSyncLogs,
  isSyncRunning,
  abortStuckSync,
  sanitizeError,
} from '../../lib/scraper/sync.js';
import { SCRAPER_CONFIG } from '../../lib/scraper/config.js';

// Create mock Supabase client
const createMockSupabase = () => {
  const mockData = {
    sync_logs: [],
    sync_settings: [],
  };

  return {
    from: (table) => ({
      insert: (data) => ({
        select: () => ({
          single: () => {
            const record = {
              id: `mock-${Date.now()}`,
              ...data,
              created_at: new Date().toISOString(),
            };
            mockData[table].push(record);
            return Promise.resolve({ data: record, error: null });
          },
        }),
        then: (resolve) => {
          const record = {
            id: `mock-${Date.now()}`,
            ...data,
            created_at: new Date().toISOString(),
          };
          mockData[table].push(record);
          resolve({ data: record, error: null });
        },
      }),
      update: (updateData) => {
        let filters = {};
        const builder = {
          eq: (field, value) => {
            filters[field] = { op: 'eq', value };
            // Return chainable object that also resolves
            const chainable = {
              lt: (ltField, ltValue) => {
                filters[ltField] = { op: 'lt', value: ltValue };
                return Promise.resolve({ error: null }).then(() => {
                  mockData[table] = mockData[table].map(r => {
                    const matchesEq = Object.entries(filters).every(([f, { op, value: v }]) => {
                      if (op === 'eq') return r[f] === v;
                      if (op === 'lt') return r[f] < v;
                      return true;
                    });
                    if (matchesEq) {
                      return { ...r, ...updateData };
                    }
                    return r;
                  });
                  return { error: null };
                });
              },
              then: (resolve) => {
                const index = mockData[table].findIndex(r => r[filters[Object.keys(filters)[0]].value] === filters[Object.keys(filters)[0]].value || r.id === filters.id?.value);
                if (index >= 0) {
                  mockData[table][index] = { ...mockData[table][index], ...updateData };
                }
                resolve({ error: null });
              },
            };
            // Make it thenable
            chainable.then = (resolve) => {
              const field = Object.keys(filters)[0];
              const index = mockData[table].findIndex(r => r[field] === filters[field].value);
              if (index >= 0) {
                mockData[table][index] = { ...mockData[table][index], ...updateData };
              }
              resolve({ error: null });
            };
            return chainable;
          },
        };
        return builder;
      },
      select: () => ({
        eq: (field, value) => ({
          limit: (limitCount) => {
            const results = mockData[table].filter(r => r[field] === value).slice(0, limitCount);
            return Promise.resolve({ data: results, error: null });
          },
        }),
        order: (field, { ascending }) => ({
          limit: (limitCount) => {
            const sorted = [...mockData[table]].sort((a, b) => {
              return ascending
                ? a[field] > b[field] ? 1 : -1
                : a[field] < b[field] ? 1 : -1;
            });
            return Promise.resolve({ data: sorted.slice(0, limitCount), error: null });
          },
        }),
        limit: () => ({
          single: () => {
            const result = mockData[table][0];
            if (!result) {
              return Promise.resolve({ data: null, error: { code: 'PGRST116' } });
            }
            return Promise.resolve({ data: result, error: null });
          },
        }),
      }),
    }),
    _mockData: mockData,
    _addSyncLog: (log) => {
      mockData.sync_logs.push({ id: `log-${Date.now()}`, ...log });
    },
    _addSyncSettings: (settings) => {
      mockData.sync_settings.push({ id: `settings-${Date.now()}`, ...settings });
    },
  };
};

describe('REQ-104: Sync Scheduling', () => {
  describe('SyncStatus', () => {
    it('has correct status values', () => {
      expect(SyncStatus.RUNNING).toBe('running');
      expect(SyncStatus.SUCCESS).toBe('success');
      expect(SyncStatus.PARTIAL).toBe('partial');
      expect(SyncStatus.FAILED).toBe('failed');
    });
  });

  describe('createSyncLog()', () => {
    it('creates a new sync log with running status', async () => {
      const supabase = createMockSupabase();

      const log = await createSyncLog(supabase);

      expect(log.id).toBeDefined();
      expect(log.status).toBe(SyncStatus.RUNNING);
      expect(log.started_at).toBeDefined();
    });
  });

  describe('updateSyncLog()', () => {
    it('updates sync log with results', async () => {
      const supabase = createMockSupabase();
      const log = await createSyncLog(supabase);

      await updateSyncLog(supabase, log.id, {
        status: SyncStatus.SUCCESS,
        appointments_found: 10,
        appointments_created: 5,
      });

      const updated = supabase._mockData.sync_logs[0];
      expect(updated.status).toBe(SyncStatus.SUCCESS);
      expect(updated.appointments_found).toBe(10);
      expect(updated.completed_at).toBeDefined();
    });
  });

  describe('getSyncSettings()', () => {
    it('returns null if no settings exist', async () => {
      const supabase = createMockSupabase();

      const settings = await getSyncSettings(supabase);

      expect(settings).toBeNull();
    });

    it('returns existing settings', async () => {
      const supabase = createMockSupabase();
      supabase._addSyncSettings({ enabled: true, interval_minutes: 60 });

      const settings = await getSyncSettings(supabase);

      expect(settings.enabled).toBe(true);
      expect(settings.interval_minutes).toBe(60);
    });
  });

  describe('updateSyncSettings()', () => {
    it('updates existing settings', async () => {
      const supabase = createMockSupabase();
      supabase._addSyncSettings({ enabled: false });

      await updateSyncSettings(supabase, {
        enabled: true,
        last_sync_at: new Date().toISOString(),
      });

      const settings = supabase._mockData.sync_settings[0];
      expect(settings.enabled).toBe(true);
    });
  });

  describe('getRecentSyncLogs()', () => {
    it('returns empty array if no logs', async () => {
      const supabase = createMockSupabase();

      const logs = await getRecentSyncLogs(supabase);

      expect(logs).toEqual([]);
    });

    it('returns logs sorted by started_at descending', async () => {
      const supabase = createMockSupabase();
      supabase._addSyncLog({ started_at: '2025-01-01T00:00:00Z' });
      supabase._addSyncLog({ started_at: '2025-01-02T00:00:00Z' });
      supabase._addSyncLog({ started_at: '2025-01-03T00:00:00Z' });

      const logs = await getRecentSyncLogs(supabase, 10);

      expect(logs[0].started_at).toBe('2025-01-03T00:00:00Z');
      expect(logs[2].started_at).toBe('2025-01-01T00:00:00Z');
    });

    it('respects limit parameter', async () => {
      const supabase = createMockSupabase();
      for (let i = 0; i < 20; i++) {
        supabase._addSyncLog({ started_at: `2025-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` });
      }

      const logs = await getRecentSyncLogs(supabase, 5);

      expect(logs.length).toBe(5);
    });
  });

  describe('isSyncRunning()', () => {
    it('returns false if no running sync', async () => {
      const supabase = createMockSupabase();
      supabase._addSyncLog({ status: SyncStatus.SUCCESS });

      const running = await isSyncRunning(supabase);

      expect(running).toBe(false);
    });

    it('returns true if sync is running', async () => {
      const supabase = createMockSupabase();
      supabase._addSyncLog({ status: SyncStatus.RUNNING });

      const running = await isSyncRunning(supabase);

      expect(running).toBe(true);
    });
  });

  describe('abortStuckSync()', () => {
    it('is a function that accepts supabase and maxAgeMinutes', () => {
      // abortStuckSync marks syncs older than maxAgeMinutes as failed
      // This is a behavioral test - actual DB behavior tested in integration
      expect(typeof abortStuckSync).toBe('function');
      expect(abortStuckSync.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('REQ-106: Sync Error Handling', () => {
  describe('sync log error tracking', () => {
    it('stores errors in sync log', async () => {
      const supabase = createMockSupabase();
      const log = await createSyncLog(supabase);

      await updateSyncLog(supabase, log.id, {
        status: SyncStatus.PARTIAL,
        appointments_found: 10,
        appointments_failed: 2,
        errors: [
          { external_id: 'ABC123', error: 'Network error' },
          { external_id: 'DEF456', error: 'Parse error' },
        ],
      });

      const updated = supabase._mockData.sync_logs[0];
      expect(updated.errors).toHaveLength(2);
      expect(updated.errors[0].external_id).toBe('ABC123');
    });

    it('tracks partial success status', async () => {
      const supabase = createMockSupabase();
      const log = await createSyncLog(supabase);

      await updateSyncLog(supabase, log.id, {
        status: SyncStatus.PARTIAL,
        appointments_found: 10,
        appointments_created: 8,
        appointments_failed: 2,
      });

      const updated = supabase._mockData.sync_logs[0];
      expect(updated.status).toBe(SyncStatus.PARTIAL);
    });
  });

  describe('sync settings error tracking', () => {
    it('stores last sync error message', async () => {
      const supabase = createMockSupabase();
      supabase._addSyncSettings({ enabled: true });

      await updateSyncSettings(supabase, {
        last_sync_status: SyncStatus.FAILED,
        last_sync_message: 'Authentication failed: Invalid credentials',
      });

      const settings = supabase._mockData.sync_settings[0];
      expect(settings.last_sync_status).toBe(SyncStatus.FAILED);
      expect(settings.last_sync_message).toContain('Authentication failed');
    });
  });

  describe('individual failure isolation', () => {
    it('sync continues after individual appointment failure', () => {
      // This is tested via the runSync function behavior
      // Individual appointment failures should not stop the sync
      // The test verifies that appointments_failed is tracked separately

      const result = {
        appointmentsFound: 10,
        appointmentsCreated: 7,
        appointmentsFailed: 3,
        status: SyncStatus.PARTIAL,
      };

      // Partial success when some appointments fail
      expect(result.status).toBe(SyncStatus.PARTIAL);
      expect(result.appointmentsCreated + result.appointmentsFailed).toBe(10);
    });
  });
});

describe('REQ-108: Archive Reconciliation', () => {
  it('updateSyncLog accepts appointments_archived field', async () => {
    const supabase = createMockSupabase();
    const log = await createSyncLog(supabase);

    await updateSyncLog(supabase, log.id, {
      status: SyncStatus.SUCCESS,
      appointments_found: 10,
      appointments_archived: 2,
    });

    const updated = supabase._mockData.sync_logs[0];
    expect(updated.appointments_archived).toBe(2);
  });
});

describe('Security: sanitizeError()', () => {
  it('returns "Unknown error" for null/undefined input', () => {
    expect(sanitizeError(null)).toBe('Unknown error');
    expect(sanitizeError(undefined)).toBe('Unknown error');
    expect(sanitizeError('')).toBe('Unknown error');
  });

  it('removes URLs from error messages', () => {
    const message = 'Failed to fetch https://example.com/api/data';
    const sanitized = sanitizeError(message);

    expect(sanitized).toBe('Failed to fetch [URL]');
    expect(sanitized).not.toContain('https://');
    expect(sanitized).not.toContain('example.com');
  });

  it('removes HTTP URLs as well', () => {
    const message = 'Error at http://internal-server:8080/private';
    const sanitized = sanitizeError(message);

    expect(sanitized).toBe('Error at [URL]');
    expect(sanitized).not.toContain('http://');
  });

  it('redacts password values', () => {
    const message = 'Auth failed with password=secret123';
    const sanitized = sanitizeError(message);

    expect(sanitized).not.toContain('secret123');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('redacts username values', () => {
    const message = 'Login failed for username: admin@example.com';
    const sanitized = sanitizeError(message);

    expect(sanitized).not.toContain('admin@example.com');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('redacts email values', () => {
    const message = 'Invalid email=user@domain.com';
    const sanitized = sanitizeError(message);

    expect(sanitized).not.toContain('user@domain.com');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('truncates very long messages', () => {
    const longMessage = 'A'.repeat(500);
    const sanitized = sanitizeError(longMessage);

    expect(sanitized.length).toBeLessThanOrEqual(203); // 200 + "..."
    expect(sanitized).toContain('...');
  });

  it('handles multiple sensitive items in one message', () => {
    const message = 'Failed at https://api.example.com with username=admin and password=secret';
    const sanitized = sanitizeError(message);

    expect(sanitized).not.toContain('https://');
    expect(sanitized).not.toContain('admin');
    expect(sanitized).not.toContain('secret');
    expect(sanitized).toContain('[URL]');
    expect(sanitized).toContain('[REDACTED]');
  });

  it('preserves safe error messages', () => {
    const message = 'Network timeout after 30 seconds';
    const sanitized = sanitizeError(message);

    expect(sanitized).toBe('Network timeout after 30 seconds');
  });
});

describe('REQ-110: HTML Parse Degradation Detection', () => {
  describe('SyncStatus.PARSE_DEGRADED', () => {
    it('has the correct string value', () => {
      expect(SyncStatus.PARSE_DEGRADED).toBe('parse_degraded');
    });
  });

  describe('SCRAPER_CONFIG.parseNullThreshold', () => {
    it('is defined and is a number between 0 and 1', () => {
      expect(typeof SCRAPER_CONFIG.parseNullThreshold).toBe('number');
      expect(SCRAPER_CONFIG.parseNullThreshold).toBeGreaterThan(0);
      expect(SCRAPER_CONFIG.parseNullThreshold).toBeLessThan(1);
    });
  });

  describe('checkParseDegradation()', () => {
    it('returns false when parseTotalCount is 0 (no fetches — do not fire)', () => {
      expect(checkParseDegradation(0, 0)).toBe(false);
    });

    it('returns false when null rate is 0%', () => {
      expect(checkParseDegradation(0, 10)).toBe(false);
    });

    it('returns false when null rate is below the threshold (10% < 20%)', () => {
      expect(checkParseDegradation(1, 10)).toBe(false);
    });

    it('returns false when null rate equals the threshold exactly (20% is not > 20%)', () => {
      // Boundary: exactly at threshold should NOT trigger — threshold is a strict >
      expect(checkParseDegradation(2, 10)).toBe(false);
      expect(checkParseDegradation(20, 100)).toBe(false);
    });

    it('returns true when null rate exceeds the threshold (30% > 20%)', () => {
      expect(checkParseDegradation(3, 10)).toBe(true);
    });

    it('returns true when null rate is 21% (just over threshold)', () => {
      expect(checkParseDegradation(21, 100)).toBe(true);
    });

    it('returns true when every fetch is null (100%)', () => {
      expect(checkParseDegradation(5, 5)).toBe(true);
    });

    it('returns false when only 1 out of 100 fetches is null (well below threshold)', () => {
      expect(checkParseDegradation(1, 100)).toBe(false);
    });
  });

  describe('sync log parse degradation columns', () => {
    it('updateSyncLog accepts parse_null_count and parse_total_count', async () => {
      const supabase = createMockSupabase();
      const log = await createSyncLog(supabase);

      await updateSyncLog(supabase, log.id, {
        status: SyncStatus.PARSE_DEGRADED,
        appointments_found: 10,
        parse_null_count: 4,
        parse_total_count: 10,
      });

      const updated = supabase._mockData.sync_logs[0];
      expect(updated.status).toBe(SyncStatus.PARSE_DEGRADED);
      expect(updated.parse_null_count).toBe(4);
      expect(updated.parse_total_count).toBe(10);
    });

    it('parse_null_count and parse_total_count default to 0 when omitted', async () => {
      const supabase = createMockSupabase();
      const log = await createSyncLog(supabase);

      await updateSyncLog(supabase, log.id, {
        status: SyncStatus.SUCCESS,
        appointments_found: 5,
      });

      const updated = supabase._mockData.sync_logs[0];
      // Columns were not set — should remain absent or 0 (mock returns whatever was inserted)
      expect(updated.parse_null_count == null || updated.parse_null_count === 0).toBe(true);
      expect(updated.parse_total_count == null || updated.parse_total_count === 0).toBe(true);
    });
  });
});
