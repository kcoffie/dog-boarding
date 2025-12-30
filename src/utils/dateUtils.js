// Format date for display
export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format time for display
export function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Format date and time together
export function formatDateTime(dateString) {
  return `${formatDate(dateString)} ${formatTime(dateString)}`;
}

// Get date string in YYYY-MM-DD format
export function toDateInputValue(dateString) {
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
}

// Get time string in HH:MM format
export function toTimeInputValue(dateString) {
  const date = new Date(dateString);
  return date.toTimeString().slice(0, 5);
}

// Combine date and time inputs into ISO string
export function combineDateAndTime(dateStr, timeStr) {
  return `${dateStr}T${timeStr}`;
}

// Calculate number of overnight stays
export function calculateNights(arrivalDateTime, departureDateTime) {
  const arrival = new Date(arrivalDateTime);
  const departure = new Date(departureDateTime);

  // Get the date parts only (midnight)
  const arrivalDate = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate());
  const departureDate = new Date(departure.getFullYear(), departure.getMonth(), departure.getDate());

  // Calculate days between
  const daysDiff = Math.floor((departureDate - arrivalDate) / (1000 * 60 * 60 * 24));

  // If departure is before 5 PM (17:00), don't count the last night
  const departureHour = departure.getHours();
  const departureMinutes = departure.getMinutes();
  const departureBeforeEvening = departureHour < 17 || (departureHour === 17 && departureMinutes === 0);

  // Nights = days between dates, but if departing before 5 PM on last day, subtract 1
  // Actually, a dog staying overnight means they stay from day X into day X+1
  // So if arrival is Mon and departure is Wed, they stay Mon night and Tue night = 2 nights
  // If departure is before 5 PM, the last day doesn't count as an overnight

  return Math.max(0, daysDiff);
}

// Check if a dog is staying overnight on a specific date
export function isOvernight(boarding, dateStr) {
  const date = new Date(dateStr);
  const arrival = new Date(boarding.arrivalDateTime);
  const departure = new Date(boarding.departureDateTime);

  // Set all to midnight for date comparison
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const arrivalDate = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate());
  const departureDate = new Date(departure.getFullYear(), departure.getMonth(), departure.getDate());

  // Dog is overnight on date X if:
  // 1. They arrived on or before date X
  // 2. They depart after date X (i.e., on date X+1 or later)
  // This means they stay the night of date X into date X+1

  return checkDate >= arrivalDate && checkDate < departureDate;
}

// Check if a dog is present during day hours on a specific date
export function isDayPresent(boarding, dateStr) {
  const date = new Date(dateStr);
  const arrival = new Date(boarding.arrivalDateTime);
  const departure = new Date(boarding.departureDateTime);

  // Set check date to midnight
  const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const arrivalDate = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate());
  const departureDate = new Date(departure.getFullYear(), departure.getMonth(), departure.getDate());

  // Dog is present during day if:
  // 1. Check date is between arrival date and departure date (inclusive)
  // 2. If it's arrival day, they arrived before 5 PM
  // 3. If it's departure day, any presence counts

  if (checkDate < arrivalDate || checkDate > departureDate) {
    return false;
  }

  // On arrival day, check if they arrived before 5 PM
  if (checkDate.getTime() === arrivalDate.getTime()) {
    const arrivalHour = arrival.getHours();
    return arrivalHour < 17;
  }

  // On departure day, they're present during day
  if (checkDate.getTime() === departureDate.getTime()) {
    return true;
  }

  // Any day in between, they're present all day
  return true;
}

// Generate array of dates for a range
export function getDateRange(startDate, days) {
  const dates = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}

// Format date for column header
export function formatDateShort(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

// Get day of week abbreviation
export function getDayOfWeek(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}
