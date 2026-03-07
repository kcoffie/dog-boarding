/**
 * Single source of truth for worker identity data.
 *
 * Both the daytime schedule parser (daytimeSchedule.js) and the picture-of-day
 * data layer (pictureOfDay.js) need worker IDs and names. Keeping them here
 * means a worker roster change requires one edit in one file.
 *
 * WORKER_ORDER drives the left-to-right column order in the rendered image.
 * KNOWN_WORKERS maps external UID → display name (uid 0 = no worker assigned).
 */

export const WORKERS = [
  { id: 61023,  name: 'Charlie' },
  { id: 208669, name: 'Kathalyn Dominguez' },
  { id: 141407, name: 'Kentaro Cavey' },
  { id: 174385, name: 'Max Posse' },
  { id: 189436, name: 'Sierra Tagle' },
  { id: 164375, name: 'Stephen Muro' },
];

/** Stable display order for worker columns in the rendered image. */
export const WORKER_ORDER = WORKERS.map(w => w.id);

/**
 * Maps worker external UID → display name.
 * uid 0 = no worker assigned (typical for boarding events).
 * Frozen to catch accidental mutation at runtime.
 */
export const KNOWN_WORKERS = Object.freeze({
  0: null,
  ...Object.fromEntries(WORKERS.map(w => [w.id, w.name])),
});
