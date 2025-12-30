import { useData } from '../context/DataContext';
import { getDateRange, isOvernight } from '../utils/dateUtils';

export default function EmployeeTotals({ startDate, days = 14 }) {
  const { dogs, boardings, settings, nightAssignments } = useData();

  // Helper to check if employee is active
  const isEmployeeActive = (name) => {
    const emp = settings.employees.find(e =>
      (typeof e === 'string' ? e : e.name) === name
    );
    if (!emp) return true;
    return typeof emp === 'string' ? true : emp.active !== false;
  };

  const dates = getDateRange(startDate.toISOString().split('T')[0], days);

  const calculateDayNet = (dateStr) => {
    let gross = 0;
    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      for (const boarding of dogBoardings) {
        if (isOvernight(boarding, dateStr)) {
          gross += dog.nightRate;
          break;
        }
      }
    }
    return gross * (settings.netPercentage / 100);
  };

  // Format a single date for display
  const formatShortDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Format dates into ranges (e.g., "Jan 15-17, Jan 20, Jan 25-27")
  const formatDateRanges = (dateStrings) => {
    if (dateStrings.length === 0) return '';

    // Sort dates chronologically
    const sorted = [...dateStrings].sort();
    const ranges = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(rangeEnd + 'T00:00:00');
      const currDate = new Date(sorted[i] + 'T00:00:00');
      const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        // Consecutive day, extend the range
        rangeEnd = sorted[i];
      } else {
        // Gap found, save current range and start new one
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    // Don't forget the last range
    ranges.push({ start: rangeStart, end: rangeEnd });

    // Format ranges into strings
    return ranges.map(({ start, end }) => {
      const startDate = new Date(start + 'T00:00:00');
      const endDate = new Date(end + 'T00:00:00');

      if (start === end) {
        return formatShortDate(start);
      }

      // Same month - show "Jan 15-17"
      if (startDate.getMonth() === endDate.getMonth()) {
        return `${startDate.toLocaleDateString('en-US', { month: 'short' })} ${startDate.getDate()}-${endDate.getDate()}`;
      }

      // Different months - show "Jan 30 - Feb 2"
      return `${formatShortDate(start)} - ${formatShortDate(end)}`;
    }).join(', ');
  };

  // Calculate totals per employee for the displayed date range
  const employeeTotals = {};

  for (const dateStr of dates) {
    const assignment = nightAssignments.find(a => a.date === dateStr);
    if (assignment && assignment.employeeName) {
      const net = calculateDayNet(dateStr);
      if (!employeeTotals[assignment.employeeName]) {
        employeeTotals[assignment.employeeName] = { nights: 0, earnings: 0, dates: [] };
      }
      employeeTotals[assignment.employeeName].nights += 1;
      employeeTotals[assignment.employeeName].earnings += net;
      employeeTotals[assignment.employeeName].dates.push(dateStr);
    }
  }

  const employeeNames = Object.keys(employeeTotals).sort();

  if (employeeNames.length === 0) {
    return null;
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="mt-6 bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Employee Totals</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {employeeNames.map((name) => {
          const active = isEmployeeActive(name);
          return (
            <div key={name} className={`bg-gray-50 rounded-lg p-4 ${!active ? 'opacity-50' : ''}`}>
              <div className={`font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{name}</div>
              <div className="mt-2 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Nights worked:</span>
                  <span className="font-medium">{employeeTotals[name].nights}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Total earnings:</span>
                  <span className={`font-medium ${active ? 'text-green-600' : 'text-gray-400'}`}>
                    {formatCurrency(employeeTotals[name].earnings)}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <span className="text-gray-500">Dates: </span>
                  <span className="text-gray-700">{formatDateRanges(employeeTotals[name].dates)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
