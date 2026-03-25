/**
 * Shared post-detail appointment filter.
 *
 * Both sync paths (browser runSync and cron runDetailSync) call this after
 * fetching appointment detail to decide whether to save the appointment as a
 * boarding. Centralising here means a single edit is reflected in both paths.
 *
 * Filters applied in order:
 *   1. Title / service_type — nonBoardingPatterns from config
 *   2. booking_status       — skip 'canceled' booking requests
 *   3. Pricing              — skip when all line items are day services
 *   4. Same-day duration    — skip appointments shorter than MIN_BOARDING_HOURS
 *   5. Date-overlap         — skip boardings outside the requested window (browser sync only)
 *
 * @requirements REQ-104
 */

import { SCRAPER_CONFIG } from './config.js';

/**
 * Appointments shorter than this are daycare events, not overnight boardings.
 * Covers same-day PG daycare / DC add-ons whose pricing hasn't been entered yet
 * (empty lineItems → pricing filter doesn't fire for those).
 */
const MIN_BOARDING_HOURS = 12;

/**
 * Decide whether an appointment should be saved as a boarding.
 *
 * @param {Object} details          - Result of fetchAppointmentDetails()
 * @param {string|null} scheduleTitle - Title from the schedule page; used as fallback
 *                                     for service_type when the detail page doesn't
 *                                     expose it clearly.
 * @param {Object}  [options]
 * @param {boolean} [options.boardingOnly=true] - When false all filters are bypassed.
 * @param {Date}    [options.startDate] - Skip boardings that end before this date.
 * @param {Date}    [options.endDate]   - Skip boardings that start after this date.
 * @returns {{ skip: boolean, reason: string|null }}
 */
export function applyDetailFilters(details, scheduleTitle, {
  boardingOnly = true,
  startDate,
  endDate,
} = {}) {
  if (!boardingOnly) return { skip: false, reason: null };

  // ── 1. Title / service_type ────────────────────────────────────────────────
  // service_type from the detail page is the authoritative title for filtering.
  // Falls back to the schedule-page title when service_type is absent.
  const checkLower = (details.service_type || scheduleTitle || '').toLowerCase();
  const titleMatch = SCRAPER_CONFIG.nonBoardingPatterns.find(re => re.test(checkLower));
  if (titleMatch) {
    return { skip: true, reason: `title_pattern: ${titleMatch}` };
  }

  // ── 2. Cancelled booking requests ─────────────────────────────────────────
  // booking_status='canceled' means the client submitted a request that was
  // never confirmed. These are not real boardings.
  if (details.booking_status === 'canceled') {
    return { skip: true, reason: 'booking_status: canceled' };
  }

  // ── 3. Pricing ────────────────────────────────────────────────────────────
  // Guard: only applied when lineItems is non-empty. Uninvoiced future boardings
  // legitimately have no line items and must not be filtered out.
  if (details.pricing?.lineItems?.length > 0) {
    const { dayServicePatterns } = SCRAPER_CONFIG;
    const allDayServices = details.pricing.lineItems.every(item =>
      dayServicePatterns.some(p => p.test(item.serviceName))
    );
    if (allDayServices) {
      const services = details.pricing.lineItems.map(i => i.serviceName).join(', ');
      return { skip: true, reason: `pricing: all day services (${services})` };
    }
  }

  // ── 4. Same-day duration ──────────────────────────────────────────────────
  // Appointments shorter than MIN_BOARDING_HOURS are daycare/pack-group events.
  // This catches cases where no line items are present yet (pricing filter above
  // is bypassed), such as same-day PG daycare entries on the schedule.
  if (details.check_in_datetime && details.check_out_datetime) {
    const durationHours =
      (new Date(details.check_out_datetime) - new Date(details.check_in_datetime)) / 3_600_000;
    if (durationHours < MIN_BOARDING_HOURS) {
      return {
        skip: true,
        reason: `same_day: duration ${durationHours.toFixed(1)}h < ${MIN_BOARDING_HOURS}h`,
      };
    }
  }

  // ── 5. Date-overlap ───────────────────────────────────────────────────────
  // Only passed by browser sync (runSync). Cron path uses a cursor and does
  // not supply startDate/endDate.
  if ((startDate || endDate) && details.check_in_datetime && details.check_out_datetime) {
    const checkIn  = new Date(details.check_in_datetime);
    const checkOut = new Date(details.check_out_datetime);
    // Use >= for checkOut so a boarding ending exactly on startDate (midnight,
    // from title-parsed dates) still counts as overlapping.
    const overlaps = (!endDate || checkIn < endDate) && (!startDate || checkOut >= startDate);
    if (!overlaps) {
      return {
        skip: true,
        reason: `date_overlap: ${details.check_in_datetime} → ${details.check_out_datetime}`,
      };
    }
  }

  return { skip: false, reason: null };
}
