import { isOvernight } from './dateUtils';

/**
 * A boarding that reconciliation marked as gone from the booking site
 * (cancelled_at set) has no nights: it's left out of pay and the rosters.
 * The row is kept, never deleted (REQ-108, #322).
 * @param {Array} boardings - List of boardings
 * @returns {Array} - Boardings not marked cancelled
 */
export function activeBoardings(boardings) {
  return boardings.filter(b => !b.cancelledAt);
}

/**
 * The rate a boarding's nights count at: the booking's price (what the booking site charged),
 * else the dog's rate, else 0 (REQ-203).
 * @param {Object} boarding - Boarding with nightRate
 * @param {Object} [dog] - Dog with nightRate
 * @returns {number}
 */
export function nightRate(boarding, dog) {
  return boarding.nightRate ?? dog?.nightRate ?? 0;
}

// Earliest arrival first; the id breaks a tie so the pick never depends on load order.
function byArrival(a, b) {
  const t = new Date(a.arrivalDateTime) - new Date(b.arrivalDateTime);
  if (t !== 0) return t;
  // Stryker disable next-line EqualityOperator: boarding ids are unique, so the two ids are never equal
  return String(a.id) < String(b.id) ? -1 : 1;
}

/**
 * Who stays overnight on a date, and at what rate. Every view that counts nights or money
 * uses this, so they can't disagree (#342). Cancelled boardings have no nights. A dog counts
 * once a night; if two of its boardings cover the night, the one that arrived first sets the rate.
 * @param {Array} dogs - List of dogs
 * @param {Array} boardings - List of boardings (cancelled ones are left out here)
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Array<{dog: Object, boarding: Object, rate: number}>} - One entry per dog, in dogs order
 */
export function nightStays(dogs, boardings, dateStr) {
  const tonight = activeBoardings(boardings).filter(b => isOvernight(b, dateStr));
  const stays = [];
  for (const dog of dogs) {
    const [first] = tonight.filter(b => b.dogId === dog.id).sort(byArrival);
    if (first) stays.push({ dog, boarding: first, rate: nightRate(first, dog) });
  }
  return stays;
}

/**
 * Calculate gross revenue for a specific date
 * @param {Array} dogs - List of dogs
 * @param {Array} boardings - List of boardings
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number} - Gross revenue for that date
 */
export function calculateGross(dogs, boardings, dateStr) {
  return nightStays(dogs, boardings, dateStr).reduce((total, s) => total + s.rate, 0);
}

/**
 * Day rates of the dogs staying overnight on a date: the gross a worker's daytime
 * follow-on credit is paid from when they also worked the following day.
 * @param {Array} dogs - List of dogs with dayRate
 * @param {Array} boardings - List of boardings
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number}
 */
export function calculateDaytimeGross(dogs, boardings, dateStr) {
  return nightStays(dogs, boardings, dateStr).reduce((total, s) => total + (s.dog.dayRate ?? 0), 0);
}

/**
 * Calculate net revenue (what employee earns)
 * @param {number} gross - Gross revenue
 * @param {number} percentage - Net percentage (0-100)
 * @returns {number} - Net revenue
 */
export function calculateNet(gross, percentage) {
  return gross * (percentage / 100);
}

/**
 * Count number of dogs staying overnight on a date
 * @param {Array} dogs - List of dogs
 * @param {Array} boardings - List of boardings
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number} - Count of overnight dogs
 */
export function countOvernightDogs(dogs, boardings, dateStr) {
  return nightStays(dogs, boardings, dateStr).length;
}

/**
 * Calculate totals per employee for a date range
 * @param {Array} nightAssignments - List of night assignments
 * @param {Array} dogs - List of dogs
 * @param {Array} boardings - List of boardings
 * @param {Array} dates - Array of date strings (YYYY-MM-DD)
 * @param {number} netPercentage - Net percentage (0-100)
 * @returns {Object} - Map of employee name to { nights, earnings, dates }
 */
export function calculateEmployeeTotals(nightAssignments, dogs, boardings, dates, netPercentage) {
  const totals = {};

  for (const dateStr of dates) {
    const assignment = nightAssignments.find(a => a.date === dateStr);
    if (assignment && assignment.employeeName) {
      const gross = calculateGross(dogs, boardings, dateStr);
      const net = calculateNet(gross, netPercentage);

      if (!totals[assignment.employeeName]) {
        totals[assignment.employeeName] = { nights: 0, earnings: 0, dates: [] };
      }
      totals[assignment.employeeName].nights += 1;
      totals[assignment.employeeName].earnings += net;
      totals[assignment.employeeName].dates.push(dateStr);
    }
  }

  return totals;
}

/**
 * Calculate daytime follow-on credit for a worker who worked the following day.
 * Matches pet names from daytime_appointments against the dogs array by name
 * and sums their dayRate × (netPercentage / 100).
 * @param {string[]} petNames - Unique pet names with daytime appointments that day
 * @param {Array} dogs - Dogs array with { name, dayRate }
 * @param {number} netPercentage - Net percentage (0-100)
 * @returns {number} - Daytime credit amount
 */
export function calculateDaytimeCredit(petNames, dogs, netPercentage) {
  let gross = 0;
  const seen = new Set();
  for (const name of petNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    const dog = dogs.find(d => d.name === name);
    if (dog) gross += dog.dayRate ?? 0;
  }
  return gross * (netPercentage / 100);
}

/**
 * Calculate total gross revenue for a boarding
 * @param {Object} dog - Dog with nightRate
 * @param {Object} boarding - Boarding with arrival/departure
 * @param {Array} dates - Array of date strings to check
 * @returns {number} - Total gross for this boarding
 */
export function calculateBoardingGross(dog, boarding, dates) {
  let total = 0;
  const rate = nightRate(boarding, dog);
  for (const dateStr of dates) {
    if (isOvernight(boarding, dateStr)) {
      total += rate;
    }
  }
  return total;
}
