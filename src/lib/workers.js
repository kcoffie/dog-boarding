/**
 * Single source of truth for which AGYD worker IDs the app knows.
 *
 * Both the daytime schedule parser (daytimeSchedule.js) and the picture-of-day
 * data layer (pictureOfDay.js) need worker IDs. Names are not kept here: the repo
 * is public, so they live only in the Supabase `workers` table, which
 * pictureOfDay.js reads (#281). Adding a worker means a row in that table and
 * an ID here (docs/RUNBOOK.md).
 *
 * WORKER_ORDER drives the left-to-right column order in the rendered image.
 * KNOWN_WORKERS holds every known external UID (uid 0 = no worker assigned).
 */

/** AGYD worker UIDs (the `ew-{uid}` class on schedule events), in column order. */
export const WORKER_IDS = [61023, 208669, 141407, 174385, 189436, 164375];

/** Stable display order for worker columns in the rendered image. */
export const WORKER_ORDER = WORKER_IDS;

/**
 * Every known worker external UID. uid 0 = no worker assigned (typical for boarding events).
 */
export const KNOWN_WORKERS = new Set([0, ...WORKER_IDS]);
