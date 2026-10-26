// Booking times are "site clock" values (#353, ADR-009): the booking site writes a
// San Francisco clock time as if it were UTC, so 10:00am is stored as 10:00Z, all year.
// Their UTC parts ARE the San Francisco date and time. Read them only through this module;
// a local-zone method (getHours, toLocaleString without timeZone...) shows them 7–8 h off.
// Real moments (created_at, cancelled_at, paid_date, cron times) are not site clock values.
import { BUSINESS_TIME_ZONE } from './dateUtils.js';

const valid = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

// The booking's San Francisco date as YYYY-MM-DD
export function siteDate(iso) {
  const d = valid(iso);
  return d ? d.toISOString().slice(0, 10) : null;
}

// The booking's date formatted with Intl options, e.g. { weekday: 'short' } → "Sat"
export function formatSiteDate(iso, options) {
  const d = valid(iso);
  return d ? d.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' }) : null;
}

// The booking's San Francisco clock time, "10:15 AM"
export function siteTime(iso) {
  const d = valid(iso);
  return d ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) : null;
}

// Times a title-only date gets: midnight where the sync ran (Vercel 00:00Z, a Pacific
// browser 07:00/08:00Z, a Paris browser 23:00Z). Shown with no time (Kate, Q2 and Q6).
const TITLE_ONLY_HOURS = [0, 7, 8, 23];

// 'shown', 'title-only' (no AM/PM label and a sync-midnight time), or 'contradicts'
// (the site's AM/PM label disagrees with the time; Kate: date only, Q5)
export function timeStatus(iso, ampm) {
  const d = valid(iso);
  const onTheHour = d && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (!ampm) return onTheHour && TITLE_ONLY_HOURS.includes(d.getUTCHours()) ? 'title-only' : 'shown';
  const pm = d ? d.getUTCHours() >= 12 : false;
  return pm === (ampm.toUpperCase() === 'PM') ? 'shown' : 'contradicts';
}

// The time to show for a booking, "10:15 AM PT", or null when only its date is known
export function bookingTime(iso, ampm) {
  const time = siteTime(iso);
  return time && timeStatus(iso, ampm) === 'shown' ? `${time} PT` : null;
}

// San Francisco's wall clock now, written the same way, to compare with booking times.
// An ISO string, not a Date, so it can't be passed to a Pacific formatter by mistake.
export function siteNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BUSINESS_TIME_ZONE, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
}

// A calendar date the user picked (a local-midnight Date) as the site clock's midnight of that day
export function siteMidnight(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString();
}
