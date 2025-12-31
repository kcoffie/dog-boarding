import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { formatName } from '../utils/dateUtils';

// Color generation from dog name
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function stringToColor(str) {
  const hash = hashString(str.toLowerCase());
  const hue = Math.abs(hash % 360);
  return {
    bg: `hsl(${hue}, 70%, 90%)`,
    border: `hsl(${hue}, 65%, 50%)`,
    text: `hsl(${hue}, 65%, 30%)`,
  };
}

// Date utilities
function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDay = firstDay.getDay();

  return { firstDay, lastDay, daysInMonth, startingDay };
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

export default function CalendarPage() {
  const { dogs, boardings, getNetPercentageForDate } = useData();
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { daysInMonth, startingDay } = getMonthData(year, month);

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Get dog info by ID
  const getDog = (dogId) => dogs.find(d => d.id === dogId);
  const getDogName = (dogId) => formatName(getDog(dogId)?.name) || 'Unknown';
  const getDogNightRate = (dogId) => getDog(dogId)?.nightRate || 0;

  // Transform boardings to calendar format
  const calendarBookings = useMemo(() => {
    return boardings.map(b => ({
      id: b.id,
      dog_name: getDogName(b.dogId),
      dogId: b.dogId,
      arrival_datetime: b.arrivalDateTime,
      departure_datetime: b.departureDateTime,
    }));
  }, [boardings, dogs]);

  // Filter bookings that overlap with current month
  const monthBookings = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    return calendarBookings.filter(b => {
      const arrival = new Date(b.arrival_datetime);
      const departure = new Date(b.departure_datetime);
      return arrival <= monthEnd && departure >= monthStart;
    });
  }, [calendarBookings, year, month]);

  // Get bookings for a specific day
  const getBookingsForDay = (day) => {
    const date = new Date(year, month, day);
    return monthBookings.filter(b => {
      const arrival = new Date(b.arrival_datetime);
      const departure = new Date(b.departure_datetime);
      const arrivalDate = new Date(arrival);
      arrivalDate.setHours(0, 0, 0, 0);
      const depDate = new Date(departure);
      depDate.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      return checkDate >= arrivalDate && checkDate <= depDate;
    });
  };

  // Calculate bar positions for a day
  const getBarSegments = (day) => {
    const bookings = getBookingsForDay(day);
    const date = new Date(year, month, day);

    return bookings.map(b => {
      const arrival = new Date(b.arrival_datetime);
      const departure = new Date(b.departure_datetime);
      const isStart = isSameDay(arrival, date);
      const isEnd = isSameDay(departure, date);

      return {
        ...b,
        isStart,
        isEnd,
        colors: stringToColor(b.dog_name),
      };
    }).slice(0, 4); // Limit to 4 visible
  };

  const getMoreCount = (day) => {
    const bookings = getBookingsForDay(day);
    return Math.max(0, bookings.length - 4);
  };

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Generate calendar grid
  const weeks = [];
  let days = [];

  // Add empty cells for days before the first of the month
  for (let i = 0; i < startingDay; i++) {
    days.push(null);
  }

  // Add days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
    if (days.length === 7) {
      weeks.push(days);
      days = [];
    }
  }

  // Add remaining days to complete the last week
  if (days.length > 0) {
    while (days.length < 7) {
      days.push(null);
    }
    weeks.push(days);
  }

  // Selected day details
  const selectedDayBookings = selectedDate ? getBookingsForDay(selectedDate) : [];
  const selectedDateObj = selectedDate ? new Date(year, month, selectedDate) : null;
  const selectedDateStr = selectedDateObj ? selectedDateObj.toISOString().split('T')[0] : null;

  const getStatus = (booking) => {
    if (!selectedDateObj) return '';
    const arrival = new Date(booking.arrival_datetime);
    const departure = new Date(booking.departure_datetime);
    if (isSameDay(arrival, selectedDateObj)) return 'arriving';
    if (isSameDay(departure, selectedDateObj)) return 'departing';
    return 'staying';
  };

  const arriving = selectedDayBookings.filter(b => getStatus(b) === 'arriving');
  const staying = selectedDayBookings.filter(b => getStatus(b) === 'staying');
  const departing = selectedDayBookings.filter(b => getStatus(b) === 'departing');

  // Check if a dog is staying overnight on selected date
  const isOvernight = (booking) => {
    if (!selectedDateObj) return false;
    const departure = new Date(booking.departure_datetime);
    const nextDay = new Date(selectedDateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    return departure >= nextDay;
  };

  const overnightBookings = selectedDayBookings.filter(isOvernight);
  const overnightCount = overnightBookings.length;
  const grossTotal = overnightBookings.reduce((sum, b) => sum + getDogNightRate(b.dogId), 0);
  const netPercentage = selectedDateStr ? getNetPercentageForDate(selectedDateStr) : 65;
  const netTotal = (grossTotal * (netPercentage / 100)).toFixed(2);

  // Check if a day is today
  const today = new Date();
  const isToday = (day) => {
    return day === today.getDate() &&
           month === today.getMonth() &&
           year === today.getFullYear();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Boarding Calendar</h1>
        <p className="text-slate-500 mt-1">Click a day to see details</p>
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">{monthName}</h2>
          <div className="w-24" /> {/* Spacer for centering */}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar Grid */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar weeks */}
          <div className="divide-y divide-slate-100">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-cols-7 divide-x divide-slate-100">
                {week.map((day, dayIndex) => {
                  const isWeekend = dayIndex === 0 || dayIndex === 6;
                  const isSelected = day === selectedDate;
                  const isTodayCell = day && isToday(day);
                  const segments = day ? getBarSegments(day) : [];
                  const moreCount = day ? getMoreCount(day) : 0;

                  return (
                    <div
                      key={dayIndex}
                      onClick={() => day && setSelectedDate(day === selectedDate ? null : day)}
                      className={`
                        min-h-24 p-1 cursor-pointer transition-colors
                        ${!day ? 'bg-slate-50' : ''}
                        ${isWeekend && day ? 'bg-slate-50/50' : ''}
                        ${isSelected ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-500' : ''}
                        ${day && !isSelected ? 'hover:bg-slate-50' : ''}
                      `}
                    >
                      {day && (
                        <>
                          <div className={`
                            text-right text-sm font-medium mb-1 px-1
                            ${isTodayCell ? 'text-indigo-600' : 'text-slate-700'}
                          `}>
                            {isTodayCell ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-600 text-white rounded-full text-xs">
                                {day}
                              </span>
                            ) : day}
                          </div>
                          <div className="space-y-0.5">
                            {segments.map((seg, i) => (
                              <div
                                key={seg.id + '-' + i}
                                className="text-xs px-1.5 py-0.5 truncate transition-transform hover:scale-[1.02]"
                                style={{
                                  backgroundColor: seg.colors.bg,
                                  borderLeft: seg.isStart ? `3px solid ${seg.colors.border}` : 'none',
                                  borderRadius: seg.isStart && seg.isEnd ? '4px' :
                                                seg.isStart ? '4px 0 0 4px' :
                                                seg.isEnd ? '0 4px 4px 0' : '0',
                                  color: seg.colors.text,
                                  marginLeft: seg.isStart ? '0' : '-4px',
                                  marginRight: seg.isEnd ? '0' : '-4px',
                                }}
                              >
                                {seg.isStart ? seg.dog_name : ''}
                              </div>
                            ))}
                            {moreCount > 0 && (
                              <div className="text-xs text-slate-500 px-1">
                                +{moreCount} more
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div className={`
          lg:w-80 bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden
          transition-all duration-200
          ${selectedDate ? 'opacity-100' : 'opacity-50'}
        `}>
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">
                {selectedDateObj
                  ? selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                  : 'Select a day'
                }
              </h3>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-1 hover:bg-slate-200 rounded transition-colors"
                >
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {selectedDate ? (
            <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
              {arriving.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    Arriving ({arriving.length})
                  </h4>
                  <div className="space-y-2">
                    {arriving.map(b => (
                      <div key={b.id} className="p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                        <div className="font-medium text-slate-900">{b.dog_name}</div>
                        <div className="text-xs text-slate-500">
                          {formatTime(b.arrival_datetime)} → {formatDate(b.departure_datetime)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {staying.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Staying ({staying.length})
                  </h4>
                  <div className="space-y-2">
                    {staying.map(b => (
                      <div key={b.id} className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                        <div className="font-medium text-slate-900">{b.dog_name}</div>
                        <div className="text-xs text-slate-500">
                          Since {formatDate(b.arrival_datetime)} → {formatDate(b.departure_datetime)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {departing.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                    Departing ({departing.length})
                  </h4>
                  <div className="space-y-2">
                    {departing.map(b => (
                      <div key={b.id} className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                        <div className="font-medium text-slate-900">{b.dog_name}</div>
                        <div className="text-xs text-slate-500">
                          {formatDate(b.arrival_datetime)} → {formatTime(b.departure_datetime)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDayBookings.length === 0 && (
                <div className="text-center text-slate-400 py-8">
                  No dogs booked
                </div>
              )}

              {selectedDayBookings.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Dogs tonight:</span>
                      <span className="font-medium text-slate-900">{overnightCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gross:</span>
                      <span className="font-medium text-slate-900">${grossTotal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Net ({netPercentage}%):</span>
                      <span className="font-medium text-emerald-600">${netTotal}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>Click a day to see boarding details</p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Arriving
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span> Staying
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-amber-500 rounded-full"></span> Departing
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center justify-center w-4 h-4 bg-indigo-600 text-white rounded-full text-[10px]">1</span> Today
        </div>
      </div>
    </div>
  );
}
