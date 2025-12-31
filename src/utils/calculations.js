import { isOvernight } from './dateUtils';

/**
 * Calculate gross revenue for a specific date
 * @param {Array} dogs - List of dogs
 * @param {Array} boardings - List of boardings
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {number} - Gross revenue for that date
 */
export function calculateGross(dogs, boardings, dateStr) {
  let total = 0;
  for (const dog of dogs) {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);
    for (const boarding of dogBoardings) {
      if (isOvernight(boarding, dateStr)) {
        total += dog.nightRate;
        break; // Only count once per dog per night
      }
    }
  }
  return total;
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
  let count = 0;
  for (const dog of dogs) {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);
    for (const boarding of dogBoardings) {
      if (isOvernight(boarding, dateStr)) {
        count++;
        break;
      }
    }
  }
  return count;
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
 * Calculate total gross revenue for a boarding
 * @param {Object} dog - Dog with nightRate
 * @param {Object} boarding - Boarding with arrival/departure
 * @param {Array} dates - Array of date strings to check
 * @returns {number} - Total gross for this boarding
 */
export function calculateBoardingGross(dog, boarding, dates) {
  let total = 0;
  for (const dateStr of dates) {
    if (isOvernight(boarding, dateStr)) {
      total += dog.nightRate;
    }
  }
  return total;
}
