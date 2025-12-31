import { useData } from '../context/DataContext';
import { getDateRange, isOvernight } from '../utils/dateUtils';

export default function EmployeeTotals({ startDate, days = 14 }) {
  const { dogs, boardings, settings, getNetPercentageForDate, getNightAssignment } = useData();

  // Helper to check if employee is active
  const isEmployeeActive = (name) => {
    const emp = settings.employees.find(e =>
      (typeof e === 'string' ? e : e.name) === name
    );
    if (!emp) return true;
    return typeof emp === 'string' ? true : emp.active !== false;
  };

  const dates = getDateRange(startDate, days);

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
    const percentage = getNetPercentageForDate(dateStr);
    return gross * (percentage / 100);
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

  // Calculate totals per employee for the displayed date range (exclude N/A)
  const employeeTotals = {};

  for (const dateStr of dates) {
    const employeeName = getNightAssignment(dateStr);
    if (employeeName && employeeName !== 'N/A') {
      const net = calculateDayNet(dateStr);
      if (!employeeTotals[employeeName]) {
        employeeTotals[employeeName] = { nights: 0, earnings: 0, dates: [] };
      }
      employeeTotals[employeeName].nights += 1;
      employeeTotals[employeeName].earnings += net;
      employeeTotals[employeeName].dates.push(dateStr);
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
    <div className="mt-6 bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Employee Totals</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {employeeNames.map((name) => {
          const active = isEmployeeActive(name);
          return (
            <div key={name} className={`bg-slate-50 rounded-xl p-4 border border-slate-100 ${!active ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-sm font-semibold text-indigo-600">{name.charAt(0).toUpperCase()}</span>
                </div>
                <span className={`font-semibold ${active ? 'text-slate-900' : 'text-slate-400'}`}>{name}</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Nights worked</span>
                  <span className="font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md">{employeeTotals[name].nights}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Total earnings</span>
                  <span className={`font-semibold ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {formatCurrency(employeeTotals[name].earnings)}
                  </span>
                </div>
                <div className="pt-2 mt-2 border-t border-slate-200">
                  <span className="text-slate-500 text-xs">Dates: </span>
                  <span className="text-slate-600 text-xs">{formatDateRanges(employeeTotals[name].dates)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
