/**
 * Roster image generator — returns a PNG of the daily worker schedule.
 *
 * GET /api/roster-image?date=YYYY-MM-DD&token=SECRET
 *
 * Twilio fetches this URL when delivering the WhatsApp message, so the
 * endpoint must be publicly reachable (token-gated, not network-gated).
 *
 * Image pipeline: getPictureOfDay → satori (JSX-like objects → SVG) →
 * @resvg/resvg-js (SVG → PNG buffer) → HTTP response.
 *
 * Font: Inter TTF files are bundled in api/_fonts/ and loaded at module
 * init (once per Lambda warm instance). No network calls for fonts at
 * render time.
 *
 * Runs on Node.js runtime (NOT edge) — fs, path, and native bindings
 * for @resvg/resvg-js all require Node.js.
 *
 * @requirements REQ-v4.1
 */

import { createClient } from '@supabase/supabase-js';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPictureOfDay, parseDateParam } from '../src/lib/pictureOfDay.js';
import { decodeEntities } from '../src/lib/htmlUtils.js';

export const config = { runtime: 'nodejs' };

// ---------------------------------------------------------------------------
// Module-level singletons — initialized once per Lambda warm instance.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

// Load Inter font files at module init. readFileSync throws if files are
// missing — this is intentional: fail fast at startup, not at render time.
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
// Layout constants
// ---------------------------------------------------------------------------

const IMAGE_WIDTH = 800;
const COL_GAP = 12;     // px between worker columns
const ROW_GAP = 12;     // px between worker rows
const H_PADDING = 20;   // horizontal padding inside worker cards
const V_PADDING = 16;   // vertical padding inside worker cards
const DOG_ROW_H = 24;   // height of one dog row (px)
const WORKER_NAME_H = 28; // height of worker name row
const HEADER_H = 64;
const OUTER_PAD = 20;

// Color palette — AGYD brand colors
// Forest Green #4A773C (header bg), Sage Green #78A354 (headings),
// Deep Charcoal #333333 (body), Pure White #FFFFFF (bg), Medium Gray #777777 (secondary)
const COLORS = {
  bg: '#ffffff',
  headerBg: '#4A773C',       // Forest Green — main brand color
  headerText: '#FFFFFF',     // Pure white on green
  workerBg: '#FFFFFF',       // Pure white cards
  workerBorder: '#d0e8c2',   // Light sage green border
  workerName: '#78A354',     // Sage Green — headings
  dogCount: '#777777',       // Medium Gray — secondary text
  added: '#16a34a',          // green-600 — functional indicator, keep
  removed: '#dc2626',        // red-600 — functional indicator, keep
  unchanged: '#333333',      // Deep Charcoal — body text
  clientName: '#6b7280',     // gray-500
  updated: '#ea580c',        // orange-600 — functional indicator, keep
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

// decodeEntities imported from src/lib/htmlUtils.js

/**
 * Build a satori element (plain object, no JSX).
 * Children can be a string, a single element, or an array.
 *
 * @param {string} type       - HTML tag name ('div', 'span', etc.)
 * @param {object} style      - CSS-in-JS style object
 * @param {...*} children     - String(s) or nested elements
 * @returns {object}
 */
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
 * Extract the last name from a full name string (e.g. "Kate Coffie" → "Coffie").
 * Falls back to the full string if there is no space.
 *
 * @param {string} fullName
 * @returns {string}
 */
function lastName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Format a dog row's primary label.
 * Joins multiple pet names with ' + '; appends last name in parens.
 * Applies decodeEntities on each name — handles stale DB rows with
 * literal &quot; or &amp; sequences stored before PR #40.
 *
 * @param {string[]} petNames
 * @param {string} clientName
 * @returns {string}
 */
function dogLabel(petNames, clientName) {
  const pets = (petNames || []).map(decodeEntities).join(' + ') || '(unknown)';
  const client = lastName(decodeEntities(clientName));
  return client ? `${pets} (${client})` : pets;
}

/**
 * Format the header date string: "Thursday, March 5"
 * Never uses toISOString (UTC trap) — constructs local Date from parts.
 *
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string}
 */
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Format an ISO timestamp as a short local time string: "7:03 AM".
 * Returns null if isoStr is null/undefined, so callers can gate display.
 * Error-handling: invalid date input returns null rather than "Invalid Date".
 *
 * @param {string|null} isoStr - ISO 8601 timestamp from Supabase updated_at
 * @returns {string|null}
 */
function formatTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;
  // Explicit timezone required — Vercel Lambdas run in UTC; the user is in PST/PDT.
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
}

// ---------------------------------------------------------------------------
// Per-worker card
// ---------------------------------------------------------------------------

/**
 * Render one worker's card as a satori element.
 *
 * Layout: worker name + dog count header, then one row per dog with a
 * color-coded prefix indicator. Removed dogs get a strikethrough via
 * text-decoration (satori supports this).
 *
 * @param {object} worker   - From getPictureOfDay result
 * @param {number} colWidth - Pixel width of this column
 * @returns {object}
 */
function workerCard(worker, colWidth) {
  const todayDogCount = worker.dogs.filter(d => !d.isRemoved).length;

  const dogRows = worker.dogs.map(dog => {
    const label = dogLabel(dog.pet_names, dog.client_name);
    const color = dog.isAdded ? COLORS.added : dog.isRemoved ? COLORS.removed : COLORS.unchanged;
    const prefix = dog.isAdded ? '+' : dog.isRemoved ? '−' : ' ';
    const decoration = dog.isRemoved ? 'line-through' : 'none';

    return h('div', {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      height: DOG_ROW_H,
      paddingLeft: H_PADDING,
      paddingRight: H_PADDING,
    },
      // Prefix indicator (+/−/space)
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 700,
        fontSize: 13,
        color,
        width: 14,
        flexShrink: 0,
        marginRight: 4,
      }, prefix),
      // Dog name + client
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: 13,
        color,
        textDecoration: decoration,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }, label),
    );
  });

  return h('div', {
    display: 'flex',
    flexDirection: 'column',
    width: colWidth,
    backgroundColor: COLORS.workerBg,
    border: `1px solid ${COLORS.workerBorder}`,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: ROW_GAP,
  },
    // Worker name header row
    h('div', {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      height: WORKER_NAME_H + V_PADDING,
      paddingLeft: H_PADDING,
      paddingRight: H_PADDING,
      borderBottom: `1px solid ${COLORS.workerBorder}`,
    },
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 700,
        fontSize: 14,
        color: COLORS.workerName,
        flex: 1,
      }, worker.name),
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: 12,
        color: COLORS.dogCount,
      }, `${todayDogCount} dog${todayDogCount !== 1 ? 's' : ''}`),
    ),
    // Dog rows
    h('div', {
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 6,
      paddingBottom: 6,
    }, ...dogRows),
  );
}

// ---------------------------------------------------------------------------
// Full image layout
// ---------------------------------------------------------------------------

/**
 * Compute the number of worker columns per row based on total worker count.
 * ≤2 workers → 2 columns; 3–6 workers → 3 columns.
 *
 * @param {number} count
 * @returns {number}
 */
function columnsPerRow(count) {
  return count <= 2 ? 2 : 3;
}

/**
 * Estimate the pixel height of a single worker card (for image height calc).
 * name_header + (dogCount * DOG_ROW_H) + top/bottom padding
 *
 * @param {object} worker
 * @returns {number}
 */
function cardHeight(worker) {
  return WORKER_NAME_H + V_PADDING + 12 + worker.dogs.length * DOG_ROW_H;
}

/**
 * Compute the total image height dynamically based on content.
 * Boarders section removed in v4.1.1 — only worker cards are rendered.
 *
 * @param {object} data - getPictureOfDay result
 * @returns {number}
 */
function computeImageHeight(data) {
  const cols = columnsPerRow(data.workers.length);
  let gridH = 0;

  for (let i = 0; i < data.workers.length; i += cols) {
    const rowWorkers = data.workers.slice(i, i + cols);
    const rowH = Math.max(...rowWorkers.map(cardHeight));
    gridH += rowH + ROW_GAP;
  }

  return HEADER_H + gridH + OUTER_PAD * 3;
}

/**
 * Build the full satori element tree for the roster image.
 *
 * Structure:
 *   [Header: "Thursday, March 5 (as of 7:03 AM)"  ·  Daily Roster  ·  UPDATED!]
 *   [Worker grid: N columns, each worker gets a card]
 *
 * Boarders section removed in v4.1.1 — data.boarders still exists in the
 * data struct for easy restoration, but is not rendered here.
 *
 * @param {object} data - getPictureOfDay result (includes lastSyncedAt)
 * @returns {object} Satori element tree
 */
function buildLayout(data) {
  const cols = columnsPerRow(data.workers.length);
  const availableWidth = IMAGE_WIDTH - OUTER_PAD * 2;
  const colWidth = Math.floor((availableWidth - COL_GAP * (cols - 1)) / cols);

  // Worker grid — fill rows left to right.
  const rows = [];
  for (let i = 0; i < data.workers.length; i += cols) {
    const rowWorkers = data.workers.slice(i, i + cols);
    // Pad short rows with null so flex layout stays consistent.
    while (rowWorkers.length < cols) rowWorkers.push(null);

    rows.push(
      h('div', {
        display: 'flex',
        flexDirection: 'row',
        gap: COL_GAP,
        marginBottom: ROW_GAP,
        width: availableWidth,
      },
        ...rowWorkers.map(w =>
          w
            ? workerCard(w, colWidth)
            : h('div', { width: colWidth, flexShrink: 0 }) // empty spacer
        ),
      )
    );
  }

  // "UPDATED!" badge — shown when there are diffs vs. yesterday.
  const updatedBadge = data.hasUpdates
    ? h('span', {
        fontFamily: 'Inter',
        fontWeight: 700,
        fontSize: 13,
        color: COLORS.updated,
        marginLeft: 12,
        backgroundColor: '#fff7ed',
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 2,
        paddingBottom: 2,
        borderRadius: 4,
      }, 'UPDATED!')
    : null;

  // "as of HH:MM AM" suffix — present when live refresh ran before this render.
  // Decision: null lastSyncedAt means we're rendering from midnight cron data;
  // omit the suffix rather than show a stale time.
  const asOfTime = formatTime(data.lastSyncedAt);
  const dateLabel = asOfTime
    ? `${formatDate(data.date)} (as of ${asOfTime})`
    : formatDate(data.date);

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
      }, dateLabel),
      h('span', {
        fontFamily: 'Inter',
        fontWeight: 400,
        fontSize: 13,
        color: '#94a3b8', // slate-400
      }, 'Daily Roster'),
      updatedBadge,
    ),

    // Worker grid
    h('div', {
      display: 'flex',
      flexDirection: 'column',
      padding: OUTER_PAD,
    },
      ...rows,
    ),
  );
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- Auth: constant-time token comparison to prevent timing attacks ---
  const providedToken = req.query.token || '';
  const expectedToken = process.env.VITE_SYNC_PROXY_TOKEN || '';
  if (!expectedToken || providedToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // --- Input validation: date param ---
  let date;
  try {
    date = parseDateParam(req.query.date || '');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  console.log(`[RosterImage] Generating image for ${req.query.date}`);

  try {
    const supabase = getSupabase();

    // Fetch picture data
    const data = await getPictureOfDay(supabase, date);
    console.log(`[RosterImage] Data: ${data.workers.length} workers, hasUpdates: ${data.hasUpdates}, lastSyncedAt: ${data.lastSyncedAt ?? 'none'}`);

    // Build layout — log dateLabel so we can verify the "(as of HH:MM AM)" suffix
    // was applied (or explain its absence if formatTime returned null).
    const element = buildLayout(data);
    const height = computeImageHeight(data);
    const asOf = data.lastSyncedAt ? ` (as of ${data.lastSyncedAt})` : ' (no live refresh)';
    console.log(`[RosterImage] Header timestamp: ${asOf.trim()}`);
    console.log(`[RosterImage] Computed dimensions: ${IMAGE_WIDTH}x${height}`);

    // Render SVG via satori
    const svg = await satori(element, {
      width: IMAGE_WIDTH,
      height,
      fonts: FONTS,
    });

    // Convert SVG → PNG via resvg
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: IMAGE_WIDTH } });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    console.log(`[RosterImage] PNG generated — ${pngBuffer.length} bytes`);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', pngBuffer.length);
    // Allow Twilio to cache for 5 minutes; revalidate after.
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(pngBuffer);

  } catch (err) {
    console.error('[RosterImage] ❌ Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}
