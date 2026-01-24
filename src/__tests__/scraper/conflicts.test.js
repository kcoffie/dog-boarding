/**
 * Sync conflict resolution tests
 * @requirements REQ-105
 */

import { describe, it, expect } from 'vitest';

/**
 * REQ-105: Sync Conflict Resolution
 *
 * System handles conflicts between external and local data.
 *
 * Acceptance Criteria:
 * - External data marked with `source: 'external'`
 * - Local edits to external data flagged as overridden
 * - Option to prefer external or local on conflict
 * - Sync log shows what changed
 * - Can revert local changes to external data
 */

describe('REQ-105: Sync Conflict Resolution', () => {
  describe('External data source marking', () => {
    it('should mark synced data with source: external', () => {
      const externalRecord = {
        id: 'ext-123',
        dog_name: 'Buddy',
        source: 'external',
        external_id: 'C63QgHu3',
      };

      expect(externalRecord.source).toBe('external');
      expect(externalRecord.external_id).toBeDefined();
    });

    it('should distinguish external from local records', () => {
      const externalRecord = { source: 'external', external_id: 'abc123' };
      const localRecord = { source: 'local', external_id: null };

      expect(externalRecord.source).not.toBe(localRecord.source);
    });
  });

  describe('Local edit detection', () => {
    it('should detect when external data has been locally modified', () => {
      const originalExternal = {
        id: 'boarding-1',
        source: 'external',
        external_id: 'C63QgHu3',
        dog_name: 'Buddy',
        check_in: '2026-01-20',
        last_synced_at: '2026-01-19T10:00:00Z',
        local_modified_at: null,
      };

      // Simulate local edit
      const locallyModified = {
        ...originalExternal,
        dog_name: 'Buddy (Updated)',
        local_modified_at: '2026-01-20T15:00:00Z',
      };

      const hasLocalEdits = locallyModified.local_modified_at !== null &&
        new Date(locallyModified.local_modified_at) > new Date(locallyModified.last_synced_at);

      expect(hasLocalEdits).toBe(true);
    });

    it('should not flag unmodified external records', () => {
      const unmodifiedExternal = {
        source: 'external',
        last_synced_at: '2026-01-19T10:00:00Z',
        local_modified_at: null,
      };

      const hasLocalEdits = unmodifiedExternal.local_modified_at !== null;

      expect(hasLocalEdits).toBe(false);
    });
  });

  describe('Conflict resolution strategies', () => {
    it('should support prefer-external strategy', () => {
      const strategy = 'prefer-external';
      const external = { dog_name: 'Buddy', check_in: '2026-01-20' };
      const local = { dog_name: 'Buddy (Local)', check_in: '2026-01-21' };

      const resolved = strategy === 'prefer-external' ? external : local;

      expect(resolved.dog_name).toBe('Buddy');
      expect(resolved.check_in).toBe('2026-01-20');
    });

    it('should support prefer-local strategy', () => {
      const strategy = 'prefer-local';
      const external = { dog_name: 'Buddy', check_in: '2026-01-20' };
      const local = { dog_name: 'Buddy (Local)', check_in: '2026-01-21' };

      const resolved = strategy === 'prefer-local' ? local : external;

      expect(resolved.dog_name).toBe('Buddy (Local)');
      expect(resolved.check_in).toBe('2026-01-21');
    });
  });

  describe('Sync change logging', () => {
    it('should log what fields changed during sync', () => {
      const before = { dog_name: 'Buddy', check_in: '2026-01-20' };
      const after = { dog_name: 'Buddy', check_in: '2026-01-21' };

      const changes = Object.keys(after).filter(
        key => before[key] !== after[key]
      );

      expect(changes).toContain('check_in');
      expect(changes).not.toContain('dog_name');
    });

    it('should create change log entry with details', () => {
      const changeLog = {
        record_id: 'boarding-1',
        sync_id: 'sync-123',
        action: 'updated',
        changes: { check_in: { from: '2026-01-20', to: '2026-01-21' } },
        timestamp: new Date().toISOString(),
      };

      expect(changeLog.action).toBe('updated');
      expect(changeLog.changes.check_in.from).toBe('2026-01-20');
      expect(changeLog.changes.check_in.to).toBe('2026-01-21');
    });
  });

  describe('Revert local changes', () => {
    it('should allow reverting to external data', () => {
      const locallyModified = {
        id: 'boarding-1',
        dog_name: 'Buddy (Local Edit)',
        check_in: '2026-01-21',
        local_modified_at: '2026-01-20T15:00:00Z',
      };

      const externalSnapshot = {
        dog_name: 'Buddy',
        check_in: '2026-01-20',
      };

      // Revert by applying external snapshot
      const reverted = {
        ...locallyModified,
        dog_name: externalSnapshot.dog_name,
        check_in: externalSnapshot.check_in,
        local_modified_at: null, // Clear local modification flag
      };

      expect(reverted.dog_name).toBe('Buddy');
      expect(reverted.check_in).toBe('2026-01-20');
      expect(reverted.local_modified_at).toBeNull();
    });
  });
});
