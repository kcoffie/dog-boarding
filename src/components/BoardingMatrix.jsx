import { useState } from 'react';
import { useData } from '../context/DataContext';
import { getDateRange, formatDateShort, getDayOfWeek, isOvernight, isDayPresent, formatName } from '../utils/dateUtils';
import EmployeeDropdown from './EmployeeDropdown';

export default function BoardingMatrix({ startDate, days = 14 }) {
  const { dogs, boardings, settings, getNetPercentageForDate, getNightAssignment } = useData();
  const [sortDirection, setSortDirection] = useState('asc');

  const dates = getDateRange(startDate, days);

  const toggleSort = () => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  };

  const isWeekend = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  };

  const needsEmployeeAttention = (dateStr) => {
    // Returns true if dogs are overnight but no employee assigned (and not N/A)
    if (settings.employees.length === 0) return false;
    const overnightCount = countOvernightDogs(dateStr);
    if (overnightCount === 0) return false;
    const assignment = getNightAssignment(dateStr);
    return !assignment; // Empty string means unassigned, N/A means covered by owner
  };

  const getColumnBg = (dateStr, isFooter = false) => {
    const needsAttention = needsEmployeeAttention(dateStr);
    const weekend = isWeekend(dateStr);
    if (needsAttention) {
      return isFooter ? 'bg-amber-100/80' : 'bg-amber-50/80';
    }
    if (weekend) {
      return isFooter ? 'bg-slate-100/60' : 'bg-slate-50/80';
    }
    return '';
  };

  const getHeaderColumnBg = (dateStr) => {
    const needsAttention = needsEmployeeAttention(dateStr);
    if (needsAttention) return 'bg-amber-100/80';
    if (isWeekend(dateStr)) return 'bg-slate-100/80';
    return '';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getPresenceIndicator = (dog, dateStr) => {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);

    let isDay = false;
    let isNight = false;

    for (const boarding of dogBoardings) {
      if (isDayPresent(boarding, dateStr)) {
        isDay = true;
      }
      if (isOvernight(boarding, dateStr)) {
        isNight = true;
      }
    }

    if (isNight) {
      return (
        <div className="w-7 h-7 mx-auto rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm" title="Overnight" />
      );
    } else if (isDay) {
      return (
        <div className="w-7 h-7 mx-auto rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 shadow-sm" title="Day only" />
      );
    }
    return <span className="text-slate-300">—</span>;
  };

  const calculateDayGross = (dateStr) => {
    let total = 0;
    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      for (const boarding of dogBoardings) {
        if (isOvernight(boarding, dateStr)) {
          total += dog.nightRate;
          break;
        }
      }
    }
    return total;
  };

  const calculateDayNet = (dateStr) => {
    const gross = calculateDayGross(dateStr);
    const percentage = getNetPercentageForDate(dateStr);
    return gross * (percentage / 100);
  };

  const countOvernightDogs = (dateStr) => {
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
  };

  const dogHasPresenceInRange = (dog) => {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);
    for (const dateStr of dates) {
      for (const boarding of dogBoardings) {
        if (isDayPresent(boarding, dateStr) || isOvernight(boarding, dateStr)) {
          return true;
        }
      }
    }
    return false;
  };

  const dogsWithBoardings = dogs
    .filter(dogHasPresenceInRange)
    .sort((a, b) => {
      const nameA = formatName(a.name).toLowerCase();
      const nameB = formatName(b.name).toLowerCase();
      const result = nameA.localeCompare(nameB);
      return sortDirection === 'asc' ? result : -result;
    });

  if (dogs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-1">No dogs yet</h3>
        <p className="text-slate-500">Go to the Dogs page to add some dogs first.</p>
      </div>
    );
  }

  if (dogsWithBoardings.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-slate-900 mb-1">No boardings in range</h3>
        <p className="text-slate-500">No dogs are boarding during the selected dates.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-slate-200">
              <th
                className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-white min-w-[140px] cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={toggleSort}
              >
                Dog
                <span className="ml-1 text-indigo-600">{sortDirection === 'asc' ? '↑' : '↓'}</span>
              </th>
              <th className="text-right px-3 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[70px]">
                Day
              </th>
              <th className="text-right px-3 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[70px]">
                Night
              </th>
              {dates.map((dateStr) => (
                <th key={dateStr} className={`text-center px-2 py-4 text-xs font-medium text-slate-500 min-w-[52px] ${getHeaderColumnBg(dateStr)}`}>
                  <div className={isWeekend(dateStr) ? 'text-slate-500' : 'text-slate-400'}>{getDayOfWeek(dateStr)}</div>
                  <div className="text-slate-600 font-semibold">{formatDateShort(dateStr)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {dogsWithBoardings.map((dog) => (
              <tr key={dog.id} className="group hover:bg-indigo-50/50 transition-colors">
                <td className="px-5 py-4 text-sm font-medium text-slate-900 sticky left-0 bg-white group-hover:bg-indigo-50/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-semibold text-indigo-600">
                        {formatName(dog.name).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span>{formatName(dog.name)}</span>
                  </div>
                </td>
                <td className="px-3 py-4 text-sm text-slate-500 text-right tabular-nums">
                  ${dog.dayRate}
                </td>
                <td className="px-3 py-4 text-sm text-slate-500 text-right tabular-nums">
                  ${dog.nightRate}
                </td>
                {dates.map((dateStr) => (
                  <td key={dateStr} className={`px-2 py-4 text-center ${getColumnBg(dateStr)}`}>
                    {getPresenceIndicator(dog, dateStr)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50/50">
            {/* Dogs Overnight Row */}
            <tr className="border-t-2 border-slate-200">
              <td className="px-5 py-4 text-sm font-semibold text-slate-700 sticky left-0 bg-slate-50/50">
                Dogs Overnight
              </td>
              <td colSpan={2}></td>
              {dates.map((dateStr) => {
                const count = countOvernightDogs(dateStr);
                return (
                  <td key={dateStr} className={`px-2 py-4 text-center text-sm font-medium text-slate-700 tabular-nums ${getColumnBg(dateStr, true)}`}>
                    {count > 0 ? count : '—'}
                  </td>
                );
              })}
            </tr>
            {/* Gross Row */}
            <tr>
              <td className="px-5 py-4 text-sm font-semibold text-slate-700 sticky left-0 bg-slate-50/50">
                Gross
              </td>
              <td colSpan={2}></td>
              {dates.map((dateStr) => {
                const gross = calculateDayGross(dateStr);
                return (
                  <td key={dateStr} className={`px-2 py-4 text-center text-sm font-medium text-slate-700 tabular-nums ${getColumnBg(dateStr, true)}`}>
                    {gross > 0 ? formatCurrency(gross) : '—'}
                  </td>
                );
              })}
            </tr>
            {/* Net Row */}
            <tr>
              <td className="px-5 py-4 text-sm font-semibold text-slate-700 sticky left-0 bg-slate-50/50">
                Net <span className="font-normal text-slate-500">({settings.netPercentage}%)</span>
              </td>
              <td colSpan={2}></td>
              {dates.map((dateStr) => {
                const net = calculateDayNet(dateStr);
                return (
                  <td key={dateStr} className={`px-2 py-4 text-center text-sm font-semibold text-emerald-600 tabular-nums ${getColumnBg(dateStr, true)}`}>
                    {net > 0 ? formatCurrency(net) : '—'}
                  </td>
                );
              })}
            </tr>
            {/* Date Row (above Employee) */}
            {settings.employees.length > 0 && (
              <tr className="border-t border-slate-200">
                <td className="px-5 py-3 text-sm font-semibold text-slate-700 sticky left-0 bg-slate-50/50">
                  Date
                </td>
                <td colSpan={2}></td>
                {dates.map((dateStr) => (
                  <td key={dateStr} className={`px-2 py-3 text-center text-xs font-medium text-slate-500 ${getColumnBg(dateStr, true)}`}>
                    <div className={isWeekend(dateStr) ? 'text-slate-500' : 'text-slate-400'}>{getDayOfWeek(dateStr)}</div>
                    <div className="text-slate-600 font-semibold">{formatDateShort(dateStr)}</div>
                  </td>
                ))}
              </tr>
            )}
            {/* Employee Row */}
            {settings.employees.length > 0 && (
              <tr>
                <td className="px-5 py-4 text-sm font-semibold text-slate-700 sticky left-0 bg-slate-50/50">
                  Employee
                </td>
                <td colSpan={2}></td>
                {dates.map((dateStr) => (
                  <td key={dateStr} className={`px-1 py-3 ${getColumnBg(dateStr, true)}`}>
                    <EmployeeDropdown date={dateStr} />
                  </td>
                ))}
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="px-5 py-4 border-t border-slate-200 bg-slate-50/50 flex items-center gap-6 text-sm text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-sm" />
          <span>Overnight</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-amber-400 to-amber-500 shadow-sm" />
          <span>Day only</span>
        </div>
      </div>
    </div>
  );
}
