/**
 * Booking-site redirects, read without following them (#344, ADR-008).
 *
 * The server's fetch follows redirects unless told not to. A booking URL that the site won't show
 * (an edited stay's old timestamp, some playgroup series) answers 302 → /schedule, and following it
 * parsed the whole week's schedule as the booking: wrong pet IDs, a renamed dog, $0 dogs.
 * Detail and form fetches pass `redirect: 'manual'` and classify the answer here.
 *
 * @requirements REQ-660
 */

import { SCRAPER_CONFIG } from './config.js';

/** The message runDetailSync matches to clear the session and re-queue the item. */
export const SESSION_EXPIRED_MESSAGE = 'Session expired. Re-authentication required.';

/**
 * Where a response redirects to: null when it isn't a redirect.
 *   'schedule'  — exactly /schedule on the booking site
 *   'login'     — the booking site's login page (the session expired)
 *   'elsewhere' — anything else, including another host or no usable Location
 *
 * @param {{ status: number, headers: { get(name: string): string|null } }} response
 * @returns {'schedule'|'login'|'elsewhere'|null}
 */
export function classifyRedirect(response) {
  if (!(response.status >= 300 && response.status < 400)) return null;
  let target = null;
  try {
    // Stryker disable next-line StringLiteral: any fallback resolves to a path that isn't /schedule or /login, so elsewhere either way
    target = new URL(response.headers.get('location') || '', SCRAPER_CONFIG.baseUrl);
  } catch {
    // unparseable Location: elsewhere
  }
  if (target?.host !== new URL(SCRAPER_CONFIG.baseUrl).host) return 'elsewhere';
  if (target.pathname === '/schedule') return 'schedule';
  if (/^\/login\/?$/.test(target.pathname)) return 'login';
  return 'elsewhere';
}

/** A booking page that redirected instead of showing the booking. Nothing from it may be written. */
export class DetailRedirected extends Error {
  /**
   * @param {'schedule'|'elsewhere'} kind
   * @param {string|null} location
   */
  constructor(kind, location) {
    super(`Booking page redirected to ${location || 'nowhere'}`);
    this.name = 'DetailRedirected';
    this.kind = kind;
    this.location = location;
  }
}
