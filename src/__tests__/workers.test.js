/**
 * Worker registry in code (REQ-601): IDs and column order only. Names live in the
 * Supabase `workers` table, never in the public repo (#281).
 * @requirements REQ-601
 */
import { describe, it, expect } from 'vitest';
import { WORKER_ORDER, KNOWN_WORKERS } from '../lib/workers.js';
import * as workers from '../lib/workers.js';

describe('worker registry', () => {
  it('orders the roster columns by the six worker UIDs in REQ-601', () => {
    expect(WORKER_ORDER).toEqual([61023, 208669, 141407, 174385, 189436, 164375]);
  });

  it('knows uid 0 (no worker assigned) and the six worker UIDs, nothing else', () => {
    expect([...KNOWN_WORKERS].sort((a, b) => a - b)).toEqual([0, 61023, 141407, 164375, 174385, 189436, 208669]);
  });

  it('exports no worker names: every exported value is a number or a collection of numbers', () => {
    const values = Object.values(workers).flatMap((v) => (typeof v === 'object' ? [...v] : [v]));
    expect(values.every((v) => typeof v === 'number')).toBe(true);
  });
});
