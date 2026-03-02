import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { formatName } from '../utils/dateUtils';

// Swipe gesture hook
function useSwipe(onSwipeLeft, onSwipeRight, threshold = 50) {
  const touchStart = useRef(null);
  const touchEnd = useRef(null);

  const onTouchStart = (e) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;

    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > threshold;
    const isRightSwipe = distance < -threshold;

    if (isLeftSwipe && onSwipeLeft) onSwipeLeft();
    if (isRightSwipe && onSwipeRight) onSwipeRight();
  };

  return { onTouchStart, onTouchMove, onTouchEnd };
}

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

// ─── Print helpers ───────────────────────────────────────────────────────────

/** Build a sorted array of {year, month, day} objects for [startDate, endDate]. */
function eachDayInRange(startDate, endDate) {
  const days = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** CSS injected into <head> for @media print */
const PRINT_CSS = `
@media print {
  body > * { display: none !important; }
  #calendar-print-view { display: block !important; }
}
#calendar-print-view { display: none; }
`;

/**
 * Invisible-until-print view rendered into the DOM beside the app.
 * Each day section mirrors the CalendarPage detail panel layout.
 */
function PrintView({ days, getBookingsForDayFn, getDogNightRate, getNetPercentage }) {
  useEffect(() => {
    console.log(`[print] PrintView mounted — ${days.length} days in range`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!days.length) return null;

  return (
    <div id="calendar-print-view" style={{ fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #calendar-print-view { display: block !important; }
          .print-day { page-break-inside: avoid; margin-bottom: 24px; }
        }
        #calendar-print-view { display: none; }
      `}</style>

      {days.map((date) => {
        const d = date.getDate();
        const m = date.getMonth();
        const y = date.getFullYear();
        const bookings = getBookingsForDayFn(d, m, y);
        if (bookings.length === 0) return null;

        const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        const arriving  = bookings.filter(b => isSameDay(new Date(b.arrival_datetime), date));
        const departing = bookings.filter(b => isSameDay(new Date(b.departure_datetime), date));
        const staying   = bookings.filter(b => !isSameDay(new Date(b.arrival_datetime), date) && !isSameDay(new Date(b.departure_datetime), date));

        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);
        const overnightBookings = bookings.filter(b => new Date(b.departure_datetime) >= nextDay);
        const overnightCount = overnightBookings.length;
        const grossTotal = overnightBookings.reduce((sum, b) => sum + getDogNightRate(b.dogId), 0);
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const netPct = getNetPercentage(dateStr);
        const netTotal = (grossTotal * (netPct / 100)).toFixed(2);

        return (
          <div key={dateStr} className="print-day" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '16px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', marginBottom: '10px' }}>{dateLabel}</h2>

            {arriving.length > 0 && (
              <PrintSection label="Arriving" color="#059669" bgColor="#ecfdf5" items={arriving} mode="arriving" />
            )}
            {staying.length > 0 && (
              <PrintSection label="Staying" color="#2563eb" bgColor="#eff6ff" items={staying} mode="staying" />
            )}
            {departing.length > 0 && (
              <PrintSection label="Departing" color="#d97706" bgColor="#fffbeb" items={departing} mode="departing" />
            )}

            <div style={{ marginTop: '8px', fontSize: '15px', color: '#475569', display: 'flex', gap: '16px' }}>
              <span>Dogs tonight: <strong>{overnightCount}</strong></span>
              <span>Gross: <strong>${grossTotal}</strong></span>
              <span>Net ({netPct}%): <strong style={{ color: '#059669' }}>${netTotal}</strong></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrintSection({ label, color, bgColor, items, mode }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '15px', fontWeight: '600', color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
        {label} ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {items.map(b => (
          <div key={b.id} style={{ backgroundColor: bgColor, border: `1px solid ${color}22`, borderRadius: '4px', padding: '4px 8px', fontSize: '17px' }}>
            <span style={{ fontWeight: '500', color: '#0f172a' }}>{b.dog_name}</span>
            <span style={{ color: '#64748b', marginLeft: '6px' }}>
              {mode === 'arriving' && `${formatTime(b.arrival_datetime)} → ${formatDate(b.departure_datetime)}`}
              {mode === 'departing' && `${formatDate(b.arrival_datetime)} → ${formatTime(b.departure_datetime)}`}
              {mode === 'staying' && `Since ${formatDate(b.arrival_datetime)} → ${formatDate(b.departure_datetime)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Modal: date range picker + generate button */
function PrintModal({ defaultStart, defaultEnd, onClose, onPrint }) {
  const [from, setFrom] = useState(defaultStart);
  const [to, setTo]     = useState(defaultEnd);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Print / Export</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-slate-500">
          Choose a date range. Each day with boardings will print as a separate section.
          Empty days are skipped.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={e => setTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        <button
          disabled={!from || !to || to < from}
          onClick={() => onPrint(from, to)}
          className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 active:scale-[0.98] transition-all"
        >
          Generate &amp; Print
        </button>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { dogs, boardings, getNetPercentageForDate } = useData();
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printRange, setPrintRange] = useState(null); // { from, to } as 'YYYY-MM-DD' strings

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { daysInMonth, startingDay } = getMonthData(year, month);

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Get dog info by ID
  const getDog = (dogId) => dogs.find(d => d.id === dogId);
  const getDogName = (dogId) => formatName(getDog(dogId)?.name) || 'Unknown';
  const getDogNightRate = (dogId) => getDog(dogId)?.nightRate || 0;

  // Transform boardings to calendar format
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const calendarBookings = useMemo(() => {
    return boardings.map(b => ({
      id: b.id,
      dog_name: getDogName(b.dogId),
      dogId: b.dogId,
      arrival_datetime: b.arrivalDateTime,
      departure_datetime: b.departureDateTime,
    }));
  }, [boardings, dogs]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Get bookings for any arbitrary date (used by print view)
  const getBookingsForAnyDay = (day, m, y) => {
    return calendarBookings.filter(b => {
      const arrival = new Date(b.arrival_datetime);
      const departure = new Date(b.departure_datetime);
      const arrDate = new Date(arrival.getFullYear(), arrival.getMonth(), arrival.getDate());
      const depDate = new Date(departure.getFullYear(), departure.getMonth(), departure.getDate());
      const checkDate = new Date(y, m, day);
      return checkDate >= arrDate && checkDate <= depDate;
    });
  };

  // Inject print CSS once
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'calendar-print-css';
    style.textContent = PRINT_CSS;
    if (!document.getElementById('calendar-print-css')) {
      document.head.appendChild(style);
    }
    return () => document.getElementById('calendar-print-css')?.remove();
  }, []);

  // Trigger window.print() only after React has committed PrintView to the DOM.
  // (Using useEffect guarantees the render cycle is complete before printing.)
  useEffect(() => {
    if (!printRange) return;
    const days = eachDayInRange(printRange.startDate, printRange.endDate);
    console.log(`[print] PrintView in DOM — ${days.length} day range, calling window.print()`);
    window.print();
  }, [printRange]);

  const handlePrint = (from, to) => {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const range = { startDate: new Date(fy, fm - 1, fd), endDate: new Date(ty, tm - 1, td) };
    console.log(`[print] handlePrint → ${from} to ${to}`);
    setPrintRange(range);
    setShowPrintModal(false);
  };

  // Default print range = current displayed month
  const printDefaultFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const printDefaultTo   = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  // Swipe handlers for mobile
  const swipeHandlers = useSwipe(nextMonth, prevMonth);

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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Boarding Calendar</h1>
          <p className="text-slate-500 mt-1">Click a day to see details</p>
        </div>
        <button
          onClick={() => setShowPrintModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 active:scale-[0.98] transition-all shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>

      {/* Navigation */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="min-h-[44px] min-w-[44px] p-2 hover:bg-slate-100 active:bg-slate-200 active:scale-[0.95] rounded-lg transition-all select-none flex items-center justify-center"
            >
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goToToday}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 active:scale-[0.98] rounded-lg transition-all select-none"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="min-h-[44px] min-w-[44px] p-2 hover:bg-slate-100 active:bg-slate-200 active:scale-[0.95] rounded-lg transition-all select-none flex items-center justify-center"
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
        <div
          className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden"
          {...swipeHandlers}
        >
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
                        min-h-24 p-1 cursor-pointer transition-all select-none
                        ${!day ? 'bg-slate-50' : ''}
                        ${isWeekend && day ? 'bg-slate-50/50' : ''}
                        ${isSelected ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-500' : ''}
                        ${day && !isSelected ? 'hover:bg-slate-50 active:bg-slate-100' : ''}
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
                  className="min-h-[44px] min-w-[44px] -m-2 p-2 hover:bg-slate-200 active:bg-slate-300 active:scale-[0.95] rounded-lg transition-all select-none flex items-center justify-center"
                >
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <span className="inline-flex items-center justify-center w-4 h-4 bg-indigo-600 text-white rounded-full text-[10px]">{today.getDate()}</span> Today
        </div>
      </div>

      {/* Print modal */}
      {showPrintModal && (
        <PrintModal
          defaultStart={printDefaultFrom}
          defaultEnd={printDefaultTo}
          onClose={() => setShowPrintModal(false)}
          onPrint={handlePrint}
        />
      )}

      {/* Print view — portaled to body so @media print CSS can show it while hiding #root */}
      {printRange && createPortal(
        <PrintView
          days={eachDayInRange(printRange.startDate, printRange.endDate)}
          getBookingsForDayFn={getBookingsForAnyDay}
          getDogNightRate={getDogNightRate}
          getNetPercentage={getNetPercentageForDate}
        />,
        document.body
      )}
    </div>
  );
}
