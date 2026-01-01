// Format name in title case (chester -> Chester)
export function formatName(name) {
  if (!name) return '';
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

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

  // Calculate days between (nights = days difference)
  const daysDiff = Math.floor((departureDate - arrivalDate) / (1000 * 60 * 60 * 24));

  return Math.max(0, daysDiff);
}

// Check if a dog is staying overnight on a specific date
export function isOvernight(boarding, dateStr) {
  // Parse dateStr as local time by appending time component
  const date = new Date(dateStr + 'T00:00:00');
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
  // Parse dateStr as local time by appending time component
  const date = new Date(dateStr + 'T00:00:00');
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
  // Handle both Date objects and date strings
  // For strings, append time to parse as local time (not UTC)
  const start = startDate instanceof Date
    ? new Date(startDate)
    : new Date(startDate + 'T00:00:00');
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
