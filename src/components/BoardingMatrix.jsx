import { useState, useRef, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { getDateRange, formatDateShort, getDayOfWeek, isOvernight, isDayPresent, formatName } from '../utils/dateUtils';
import EmployeeDropdown from './EmployeeDropdown';

export default function BoardingMatrix({ startDate, days = 14 }) {
  const { dogs, boardings, settings, getNetPercentageForDate, getNightAssignment } = useData();
  const [dogSortDirection, setDogSortDirection] = useState('asc');
  const [dateSortDirection, setDateSortDirection] = useState('asc');
  const [presenceSortDate, setPresenceSortDate] = useState(null);
  const [presenceSortDirection, setPresenceSortDirection] = useState('desc'); // desc = present first
  const [mobileSelectedDate, setMobileSelectedDate] = useState(null);
  const dateScrollRef = useRef(null);

  const baseDates = getDateRange(startDate, days);
  const dates = dateSortDirection === 'asc' ? baseDates : [...baseDates].reverse();

  // Initialize mobile selected date to today or first date in range
  useEffect(() => {
    if (!mobileSelectedDate || !baseDates.includes(mobileSelectedDate)) {
      const today = new Date().toISOString().split('T')[0];
      if (baseDates.includes(today)) {
        setMobileSelectedDate(today);
      } else {
        setMobileSelectedDate(baseDates[0]);
      }
    }
  }, [baseDates, mobileSelectedDate]);

  const toggleDogSort = () => {
    setDogSortDirection(dogSortDirection === 'asc' ? 'desc' : 'asc');
    setPresenceSortDate(null); // Clear presence sort when sorting by name
  };

  const toggleDateSort = () => {
    setDateSortDirection(dateSortDirection === 'asc' ? 'desc' : 'asc');
  };

  const handleDateColumnClick = (dateStr) => {
    if (presenceSortDate === dateStr) {
      // Toggle direction if clicking same date
      setPresenceSortDirection(presenceSortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // New date, start with present-first
      setPresenceSortDate(dateStr);
      setPresenceSortDirection('desc');
    }
  };

  // Get presence value for sorting: 0 = empty, 1 = overnight, 2 = day-only
  // This ordering means desc sort gives: day-only, overnight, empty
  const getPresenceValue = (dog, dateStr) => {
    const dogBoardings = boardings.filter(b => b.dogId === dog.id);
    let isDay = false;
    let isNight = false;

    for (const boarding of dogBoardings) {
      if (isDayPresent(boarding, dateStr)) isDay = true;
      if (isOvernight(boarding, dateStr)) isNight = true;
    }

    if (isNight) return 1;
    if (isDay) return 2;
    return 0;
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
    for (const dateStr of baseDates) {
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
      // If sorting by presence on a specific date
      if (presenceSortDate) {
        const presenceA = getPresenceValue(a, presenceSortDate);
        const presenceB = getPresenceValue(b, presenceSortDate);
        if (presenceA !== presenceB) {
          // desc = present first (day-only, overnight, empty)
          // asc = empty first (empty, overnight, day-only)
          return presenceSortDirection === 'desc'
            ? presenceB - presenceA
            : presenceA - presenceB;
        }
        // Fall through to name sort for ties
      }
      // Sort by dog name using dogSortDirection
      const nameA = formatName(a.name).toLowerCase();
      const nameB = formatName(b.name).toLowerCase();
      const comparison = nameA.localeCompare(nameB);
      return dogSortDirection === 'asc' ? comparison : -comparison;
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

  // Get dogs present on a specific date for mobile view
  const getDogsForMobileDate = (dateStr) => {
    if (!dateStr) return { overnight: [], dayOnly: [] };
    const overnight = [];
    const dayOnly = [];

    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      let isNight = false;
      let isDay = false;

      for (const boarding of dogBoardings) {
        if (isOvernight(boarding, dateStr)) isNight = true;
        if (isDayPresent(boarding, dateStr)) isDay = true;
      }

      if (isNight) {
        overnight.push(dog);
      } else if (isDay) {
        dayOnly.push(dog);
      }
    }

    return { overnight, dayOnly };
  };

  const mobileDogsData = getDogsForMobileDate(mobileSelectedDate);
  const mobileGross = calculateDayGross(mobileSelectedDate || baseDates[0]);
  const mobileNet = calculateDayNet(mobileSelectedDate || baseDates[0]);
  const mobileOvernightCount = countOvernightDogs(mobileSelectedDate || baseDates[0]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
      {/* Mobile View */}
      <div className="md:hidden">
        {/* Date Scroller */}
        <div
          ref={dateScrollRef}
          className="flex overflow-x-auto gap-2 p-4 pb-3 -mx-0 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {baseDates.map((dateStr) => {
            const isSelected = dateStr === mobileSelectedDate;
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const overnightCount = countOvernightDogs(dateStr);
            const weekend = isWeekend(dateStr);
            const needsAttention = needsEmployeeAttention(dateStr);

            return (
              <button
                key={dateStr}
                onClick={() => setMobileSelectedDate(dateStr)}
                className={`
                  flex-shrink-0 min-w-[56px] py-2 px-1 rounded-xl text-center snap-start
                  transition-all select-none min-h-[44px]
                  ${isSelected
                    ? 'bg-indigo-600 text-white shadow-md'
                    : needsAttention
                    ? 'bg-amber-50 border-2 border-amber-300'
                    : weekend
                    ? 'bg-slate-100 border border-slate-200'
                    : 'bg-white border border-slate-200'
                  }
                  ${!isSelected ? 'active:scale-[0.95]' : ''}
                `}
              >
                <div className={`text-[10px] uppercase tracking-wide ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {getDayOfWeek(dateStr)}
                </div>
                <div className={`text-lg font-semibold ${isSelected ? 'text-white' : isToday ? 'text-indigo-600' : 'text-slate-700'}`}>
                  {formatDateShort(dateStr)}
                </div>
                {overnightCount > 0 && (
                  <div className={`mt-1 text-[10px] font-medium ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {overnightCount} dog{overnightCount !== 1 ? 's' : ''}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Daily Summary */}
        <div className="px-4 py-3 bg-slate-50 border-y border-slate-100">
          <div className="flex justify-between items-center text-sm">
            <div className="flex gap-4">
              <div>
                <span className="text-slate-500">Overnight:</span>
                <span className="ml-1 font-semibold text-slate-700">{mobileOvernightCount}</span>
              </div>
              <div>
                <span className="text-slate-500">Gross:</span>
                <span className="ml-1 font-semibold text-slate-700">{formatCurrency(mobileGross)}</span>
              </div>
            </div>
            <div>
              <span className="text-slate-500">Net:</span>
              <span className="ml-1 font-semibold text-emerald-600">{formatCurrency(mobileNet)}</span>
            </div>
          </div>
        </div>

        {/* Dogs List */}
        <div className="divide-y divide-slate-100">
          {mobileDogsData.overnight.length === 0 && mobileDogsData.dayOnly.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No dogs booked for this date
            </div>
          ) : (
            <>
              {/* Overnight Dogs */}
              {mobileDogsData.overnight.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-indigo-50/50 text-xs font-semibold text-indigo-600 uppercase tracking-wide flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-gradient-to-br from-indigo-500 to-indigo-600" />
                    Overnight ({mobileDogsData.overnight.length})
                  </div>
                  {mobileDogsData.overnight.map((dog) => (
                    <div key={dog.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-indigo-600">
                            {formatName(dog.name).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-slate-900">{formatName(dog.name)}</span>
                      </div>
                      <span className="text-sm text-slate-600">${dog.nightRate}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Day Only Dogs */}
              {mobileDogsData.dayOnly.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-amber-50/50 text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-amber-500" />
                    Day Only ({mobileDogsData.dayOnly.length})
                  </div>
                  {mobileDogsData.dayOnly.map((dog) => (
                    <div key={dog.id} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-amber-600">
                            {formatName(dog.name).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="font-medium text-slate-900">{formatName(dog.name)}</span>
                      </div>
                      <span className="text-sm text-slate-600">${dog.dayRate}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Employee Assignment (Mobile) */}
        {settings.employees.length > 0 && mobileSelectedDate && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Employee:</span>
              <div className="w-40">
                <EmployeeDropdown date={mobileSelectedDate} />
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gradient-to-br from-indigo-500 to-indigo-600" />
            <span>Overnight</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-gradient-to-br from-amber-400 to-amber-500" />
            <span>Day only</span>
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-max">
          <thead>
            <tr className="border-b border-slate-200">
              <th
                className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider sticky left-0 bg-white min-w-[140px] cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={toggleDogSort}
                title={presenceSortDate ? 'Click to sort alphabetically and clear date sort' : 'Click to toggle alphabetical sort'}
              >
                Dog
                {!presenceSortDate && (
                  <span className="ml-1 text-indigo-600">{dogSortDirection === 'asc' ? '↑' : '↓'}</span>
                )}
                {presenceSortDate && (
                  <span className="ml-1 text-slate-400">A-Z</span>
                )}
              </th>
              <th className="text-right px-3 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[70px]">
                Day
              </th>
              <th className="text-right px-3 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider min-w-[70px]">
                Night
              </th>
              {dates.map((dateStr, index) => {
                const isActiveSortColumn = presenceSortDate === dateStr;
                return (
                  <th
                    key={dateStr}
                    className={`text-center px-2 py-2 text-xs font-medium text-slate-500 min-w-[52px] cursor-pointer hover:bg-slate-100 transition-colors ${getHeaderColumnBg(dateStr)} ${isActiveSortColumn ? 'ring-2 ring-inset ring-indigo-400' : ''}`}
                    onClick={() => handleDateColumnClick(dateStr)}
                    title="Click to sort dogs by presence on this date"
                  >
                    <div className={isWeekend(dateStr) ? 'text-slate-500' : 'text-slate-400'}>{getDayOfWeek(dateStr)}</div>
                    <div className="text-slate-600 font-semibold">{formatDateShort(dateStr)}</div>
                    {isActiveSortColumn && (
                      <div className="mt-1 text-[10px] font-medium text-indigo-600">
                        {presenceSortDirection === 'desc' ? '▲ Present' : '▼ Empty'}
                      </div>
                    )}
                    {index === 0 && !isActiveSortColumn && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleDateSort(); }}
                        className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                        title={dateSortDirection === 'asc' ? 'Showing oldest first - click for newest first' : 'Showing newest first - click for oldest first'}
                      >
                        {dateSortDirection === 'asc' ? 'Oldest' : 'Newest'}
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      </button>
                    )}
                  </th>
                );
              })}
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

      {/* Legend (Desktop only) */}
      <div className="hidden md:flex px-5 py-4 border-t border-slate-200 bg-slate-50/50 items-center gap-6 text-sm text-slate-600">
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
