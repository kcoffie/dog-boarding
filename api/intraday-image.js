/**
 * Intraday delta image generator — returns a PNG showing boarding changes since 8:30am.
 *
 * GET /api/intraday-image?date=YYYY-MM-DD&token=SECRET&ts=ISO
 *
 * Self-contained: reads the 8:30am snapshot and current boarders itself, then
 * renders a delta image ("Q Boarding Changes") showing added and cancelled dogs.
 * Double-querying is intentional and matches the existing system pattern (roster-image.js).
 *
 * Image pipeline: buildIntradayLayout → satori (JSX-like objects → SVG) →
 * @resvg/resvg-js (SVG → PNG buffer) → HTTP response.
 *
 * Runs on Node.js runtime — required by @resvg/resvg-js native bindings.
 *
 * @requirements REQ-J1
 */

import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { queryBoarders, parseDateParam } from '../src/lib/pictureOfDay.js';
import { computeIntradayDelta } from './notify-intraday.js';

export const config = { runtime: 'nodejs' };

// ---------------------------------------------------------------------------
// Module-level singletons — initialized once per Lambda warm instance.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const FONT_REGULAR = readFileSync(join(__dir, '_fonts/inter-400.ttf'));
const FONT_BOLD = readFileSync(join(__dir, '_fonts/inter-700.ttf'));

const FONTS = [
  { name: 'Inter', data: FONT_REGULAR, weight: 400, style: 'normal' },
  { name: 'Inter', data: FONT_BOLD, weight: 700, style: 'normal' },
];

// ---------------------------------------------------------------------------
// Supabase factory
// ---------------------------------------------------------------------------

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Layout constants (reuse values from roster-image.js)
// ---------------------------------------------------------------------------

const IMAGE_WIDTH = 800;
const OUTER_PAD = 20;
const HEADER_H = 64;
const DOG_ROW_H = 24;
const SECTION_HEADER_H = 36;
const SECTION_GAP = 16;

const COLORS = {
  bg: '#ffffff',
  headerBg: '#4A773C',       // Forest Green
  headerText: '#FFFFFF',
  sectionAdded: '#78A354',   // Sage Green — added section header
  sectionCancelled: '#dc2626', // red-600 — cancelled section header
  dogText: '#333333',        // Deep Charcoal
  secondary: '#777777',      // Medium Gray
  sectionBorder: '#d0e8c2',  // Light sage border
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function h(type, style, ...children) {
  const flat = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  return {
    type,
    props: {
      style,
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}

/**
 * Format a date range for the intraday image: "Apr 29 – May 2"
 * More readable than the compact format used in the roster image card.
 *
 * @param {string} arrivalIso
 * @param {string} departureIso
 * @returns {string}
 */
function formatReadableDateRange(arrivalIso, departureIso) {
  const fmt = (iso) => {
    if (!iso) return '?';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '?';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
  };
  return `${fmt(arrivalIso)} – ${fmt(departureIso)}`; // en dash with spaces
}

/**
 * Format a full date for the image header: "Wednesday, April 29"
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
function formatHeaderDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Format the "as of" time for the header right side: "as of 2:00 PM"
 * Returns null if no ts param was supplied.
 *
 * @param {string|null} isoStr
 * @returns {string|null}
 */
function formatAsOfTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Los_Angeles',
  });
}

// ---------------------------------------------------------------------------
// Image layout — exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Build the satori element tree for the intraday delta image.
 *
 * Layout:
 *   [Forest Green header: "Q Boarding Changes · Wednesday, April 29" | "since 8:30 AM (as of 2:00 PM)"]
 *   [✅ Added (N dog/dogs) — sage green section header]
 *   [  Mochi Hill (Apr 29 – May 2)]
 *   [❌ Cancelled (N dog/dogs) — red section header]
 *   [  Tula (Apr 27 – May 1)]
 *
 * Exported for unit testing.
 *
 * @param {{ date: string, added: Array, cancelled: Array, asOfStr: string|null }} opts
 * @returns {object} Satori element tree
 */
export function buildIntradayLayout({ date, added, cancelled, asOfStr }) {
  const headerDate = formatHeaderDate(date);
  const headerRight = asOfStr ? `since 8:30 AM (as of ${asOfStr})` : 'since 8:30 AM';

  // Build a delta section (Added or Cancelled).
  const buildSection = (emoji, label, boarders, headerColor) => {
    const count = boarders.length;
    const sectionLabel = `${emoji} ${label} (${count} ${count === 1 ? 'dog' : 'dogs'})`;

    const rows = boarders.map(b =>
      h('div', {
        display: 'flex',
        alignItems: 'center',
        height: DOG_ROW_H,
        paddingLeft: OUTER_PAD,
        paddingRight: OUTER_PAD,
      },
        h('span', {
          fontFamily: 'Inter',
          fontWeight: 400,
          fontSize: 13,
          color: COLORS.dogText,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }, `${b.name} (${formatReadableDateRange(b.arrival_datetime, b.departure_datetime)})`),
      )
    );

    return h('div', {
      display: 'flex',
      flexDirection: 'column',
      marginBottom: SECTION_GAP,
    },
      // Section header
      h('div', {
        display: 'flex',
        alignItems: 'center',
        height: SECTION_HEADER_H,
        paddingLeft: OUTER_PAD,
        paddingRight: OUTER_PAD,
        backgroundColor: headerColor,
        borderRadius: 4,
        marginBottom: 4,
      },
        h('span', {
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: 14,
          color: '#ffffff',
        }, sectionLabel),
      ),
      // Dog rows
      h('div', {
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: COLORS.bg,
        border: `1px solid ${COLORS.sectionBorder}`,
        borderRadius: 4,
      }, ...rows),
    );
  };

  const sections = [];
  if (added.length > 0) {
    sections.push(buildSection('✅', 'Added', added, COLORS.sectionAdded));
  }
  if (cancelled.length > 0) {
    sections.push(buildSection('❌', 'Cancelled', cancelled, COLORS.sectionCancelled));
  }

  return h('div', {
    display: 'flex',
    flexDirection: 'column',
    width: IMAGE_WIDTH,
    backgroundColor: COLORS.bg,
    fontFamily: 'Inter',
  },
    // Header bar
    h('div', {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      width: IMAGE_WIDTH,
      height: HEADER_H,
      backgroundColor: COLORS.headerBg,
      paddingLeft: OUTER_PAD,
      paddingRight: OUTER_PAD,
    },
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 700,
        fontSize: 18,
        color: COLORS.headerText,
        flex: 1,
      }, `Q Boarding Changes · ${headerDate}`),
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: 13,
        color: '#94a3b8', // slate-400
      }, headerRight),
    ),

    // Content area
    h('div', {
      display: 'flex',
      flexDirection: 'column',
      padding: OUTER_PAD,
    }, ...sections),
  );
}

/**
 * Compute the total image height for the intraday layout.
 * Exported for unit testing.
 *
 * @param {{ added: Array, cancelled: Array }} delta
 * @returns {number}
 */
export function computeIntradayImageHeight({ added, cancelled }) {
  const sectionH = (count) =>
    count > 0 ? SECTION_HEADER_H + 4 + count * DOG_ROW_H + SECTION_GAP : 0;
  return HEADER_H + OUTER_PAD * 2 + sectionH(added.length) + sectionH(cancelled.length);
}

// ---------------------------------------------------------------------------
// Snapshot reader (duplicated from notify-intraday.js — intentional per plan)
// ---------------------------------------------------------------------------

async function readBoardersSnapshot(supabase, todayStr) {
  const { data, error } = await supabase
    .from('cron_health')
    .select('result')
    .eq('cron_name', 'boarders-snapshot')
    .maybeSingle();

  if (error) {
    console.warn(`[IntradayImage] Could not read boarders snapshot: ${error.message}`);
    return null;
  }

  if (!data?.result) return null;

  if (data.result.snapshotDate !== todayStr) {
    console.log(`[IntradayImage] Snapshot date mismatch: found ${data.result.snapshotDate}, today is ${todayStr}`);
    return null;
  }

  return data.result;
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Token auth — timingSafeEqual prevents timing attacks.
  const providedToken = req.query.token ?? '';
  const expectedToken = process.env.VITE_SYNC_PROXY_TOKEN ?? '';
  const tokenValid =
    expectedToken.length > 0 &&
    providedToken.length === expectedToken.length &&
    timingSafeEqual(Buffer.from(providedToken), Buffer.from(expectedToken));
  if (!tokenValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Parse date param
  let date;
  try {
    date = parseDateParam(req.query.date || '');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const dateStr = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');

  const tsParam = req.query.ts || null;
  const asOfStr = formatAsOfTime(tsParam);

  console.log(`[IntradayImage] Generating delta image for ${dateStr}, as-of: "${asOfStr ?? 'none'}"`);

  try {
    const supabase = getSupabase();

    // Read snapshot
    const snapshot = await readBoardersSnapshot(supabase, dateStr);
    const snapshotBoarders = snapshot?.boarders ?? [];
    if (!snapshot) {
      console.log(`[IntradayImage] No snapshot for ${dateStr} — rendering empty delta`);
    }

    // Query current boarders
    const currentBoarders = await queryBoarders(supabase, dateStr);
    console.log(`[IntradayImage] Snapshot: ${snapshotBoarders.length} boarders. Current: ${currentBoarders.length} boarders`);

    // Compute delta
    const { added, cancelled } = computeIntradayDelta(snapshotBoarders, currentBoarders);
    console.log(`[IntradayImage] Delta: ${added.length} added, ${cancelled.length} cancelled`);

    const element = buildIntradayLayout({ date: dateStr, added, cancelled, asOfStr });
    const height = computeIntradayImageHeight({ added, cancelled });
    // Ensure a minimum height even when delta is empty (caller shouldn't render this,
    // but defensive guard so satori doesn't get height=0).
    const safeHeight = Math.max(height, HEADER_H + OUTER_PAD * 2);
    console.log(`[IntradayImage] Computed dimensions: ${IMAGE_WIDTH}x${safeHeight}`);

    const svg = await satori(element, { width: IMAGE_WIDTH, height: safeHeight, fonts: FONTS });
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: IMAGE_WIDTH } });
    const pngBuffer = resvg.render().asPng();

    console.log(`[IntradayImage] PNG generated — ${pngBuffer.length} bytes`);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(pngBuffer);

  } catch (err) {
    console.error('[IntradayImage] ❌ Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
