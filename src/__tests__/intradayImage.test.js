/**
 * Tests for intraday-image.js pure layout functions.
 * @requirements REQ-J1
 *
 * intraday-image.js has top-level readFileSync calls (font loading) and imports from
 * notify-intraday.js that re-export computeIntradayDelta. Modules with side effects
 * are mocked before import.
 */

import { vi, describe, it, expect } from 'vitest';

// Mock modules with top-level side effects BEFORE importing intraday-image.
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFileSync: vi.fn(() => Buffer.alloc(0)) };
});
vi.mock('@resvg/resvg-js', () => ({ Resvg: vi.fn() }));
vi.mock('satori', () => ({ default: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../lib/pictureOfDay.js', () => ({
  queryBoarders: vi.fn(),
  parseDateParam: vi.fn(),
}));
vi.mock('../../api/notify-intraday.js', async (importOriginal) => {
  // Import the actual module so we get the real computeIntradayDelta logic.
  const actual = await importOriginal();
  return { ...actual };
});

import {
  buildIntradayLayout,
  computeIntradayImageHeight,
} from '../../api/intraday-image.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function boarder(name, arrival = '2026-04-29T07:00:00Z', departure = '2026-05-02T10:00:00Z') {
  return { name, arrival_datetime: arrival, departure_datetime: departure };
}

// ---------------------------------------------------------------------------
// buildIntradayLayout
// ---------------------------------------------------------------------------

describe('buildIntradayLayout', () => {
  it('renders added section with correct dog names and date ranges', () => {
    const layout = buildIntradayLayout({
      date: '2026-04-29',
      added: [boarder('Mochi Hill', '2026-04-29T07:00:00Z', '2026-05-02T10:00:00Z')],
      cancelled: [],
      asOfStr: '2:00 PM',
    });
    const str = JSON.stringify(layout);
    expect(str).toContain('Q Boarding Changes');
    expect(str).toContain('Wednesday, April 29');
    expect(str).toContain('Added');
    expect(str).toContain('Mochi Hill');
    // Date range should be readable: "Apr 29 – May 2"
    expect(str).toContain('Apr 29');
    expect(str).toContain('May 2');
    expect(str).toContain('as of 2:00 PM');
  });

  it('renders cancelled section correctly', () => {
    const layout = buildIntradayLayout({
      date: '2026-04-29',
      added: [],
      cancelled: [boarder('Tula', '2026-04-27T07:00:00Z', '2026-05-01T10:00:00Z')],
      asOfStr: null,
    });
    const str = JSON.stringify(layout);
    expect(str).toContain('Cancelled');
    expect(str).toContain('Tula');
    expect(str).toContain('Apr 27');
    expect(str).toContain('May 1');
    // No "as of" when null
    expect(str).not.toContain('as of');
    // Header fallback
    expect(str).toContain('since 8:30 AM');
  });

  it('renders both added and cancelled sections when both are present', () => {
    const layout = buildIntradayLayout({
      date: '2026-04-29',
      added: [boarder('Bronwyn')],
      cancelled: [boarder('Tula')],
      asOfStr: '11:00 AM',
    });
    const str = JSON.stringify(layout);
    expect(str).toContain('Added');
    expect(str).toContain('Cancelled');
    expect(str).toContain('Bronwyn');
    expect(str).toContain('Tula');
  });
});

// ---------------------------------------------------------------------------
// computeIntradayImageHeight
// ---------------------------------------------------------------------------

describe('computeIntradayImageHeight', () => {
  it('returns correct height for N added + M cancelled', () => {
    const h1 = computeIntradayImageHeight({ added: [boarder('A')], cancelled: [] });
    const h2 = computeIntradayImageHeight({ added: [], cancelled: [boarder('B')] });
    const h3 = computeIntradayImageHeight({ added: [boarder('A'), boarder('B')], cancelled: [boarder('C')] });

    // More rows → taller image
    expect(h3).toBeGreaterThan(h1);
    expect(h3).toBeGreaterThan(h2);
    expect(h1).toBeGreaterThan(0);
  });

  it('returns header height only when delta is empty', () => {
    const empty = computeIntradayImageHeight({ added: [], cancelled: [] });
    const withDog = computeIntradayImageHeight({ added: [boarder('A')], cancelled: [] });
    expect(withDog).toBeGreaterThan(empty);
  });
});
