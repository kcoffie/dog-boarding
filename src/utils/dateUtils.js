import { BUSINESS_TIME_ZONE, siteDate, siteHour } from './siteClock.js';

export { BUSINESS_TIME_ZONE };

// Today's date in San Francisco as YYYY-MM-DD
export function businessToday(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { // real-moment: today's date, from the real now
      timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Today in San Francisco as a calendar date (local midnight), for the date pickers
export function businessTodayDate(now = new Date()) {
  const [y, m, d] = businessToday(now).split('-').map(Number);
  return new Date(y, m - 1, d); // real-moment: a calendar date for the pickers, not a booking time
}

// A calendar date (local midnight) as YYYY-MM-DD, from its own year, month and day.
// Never via toISOString(): east of UTC, local midnight is still the day before in UTC.
export function toDateStr(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0'); // real-moment: a calendar date, not a booking time
  const d = String(date.getDate()).padStart(2, '0'); // real-moment: a calendar date, not a booking time
  return `${date.getFullYear()}-${m}-${d}`; // real-moment: a calendar date, not a booking time
}

// Whole calendar days from start to end. A DST change in between doesn't shift it.
export function daysBetween(start, end) {
  const utc = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()); // real-moment: a calendar date, not a booking time
  return (utc(end) - utc(start)) / (1000 * 60 * 60 * 24);
}

// Format name in title case (chester -> Chester)
export function formatName(name) {
  if (!name) return '';
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Get date string in YYYY-MM-DD format
export function toDateInputValue(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
}

// Combine date and time inputs into ISO string
export function combineDateAndTime(dateStr, timeStr) {
  return `${dateStr}T${timeStr}`;
}

// Booking times are site clock values (#353, ADR-009): their dates are San Francisco dates
// on any device, read with siteDate. A YYYY-MM-DD string compares as a date.
const ONE_DAY = 1000 * 60 * 60 * 24;

// Number of overnight stays: calendar days from the arrival date to the departure date
export function calculateNights(arrivalDateTime, departureDateTime) {
  const daysDiff = (Date.parse(siteDate(departureDateTime)) - Date.parse(siteDate(arrivalDateTime))) / ONE_DAY;
  return Math.max(0, daysDiff);
}

// A dog stays the night of dateStr (into the next day) if it arrived on or before
// that date and departs after it
export function isOvernight(boarding, dateStr) {
  return siteDate(boarding.arrivalDateTime) <= dateStr && dateStr < siteDate(boarding.departureDateTime);
}

// A dog is present during the day on any date from arrival to departure, except an
// arrival day when it arrived at 5pm or later (Kate, #353 Q1)
export function isDayPresent(boarding, dateStr) {
  const arrivalDate = siteDate(boarding.arrivalDateTime);
  if (dateStr < arrivalDate || dateStr > siteDate(boarding.departureDateTime)) return false;
  if (dateStr === arrivalDate) return siteHour(boarding.arrivalDateTime) < 17;
  return true;
}

// Generate array of dates for a range
export function getDateRange(startDate, days) {
  const dates = [];
  // Handle both Date objects and date strings
  // For strings, append time to parse as local time (not UTC)
  const start = startDate instanceof Date
    ? new Date(startDate)
    : new Date(startDate + 'T00:00:00');
  start.setHours(0, 0, 0, 0); // real-moment: a calendar date, not a booking time

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i); // real-moment: a calendar date, not a booking time
    dates.push(toDateStr(date));
  }

  return dates;
}

// Format date for column header
export function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { // real-moment: a calendar date, not a booking time
    month: 'short',
    day: 'numeric',
  });
}

// Get day of week abbreviation
export function getDayOfWeek(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' }); // real-moment: a calendar date, not a booking time
}
