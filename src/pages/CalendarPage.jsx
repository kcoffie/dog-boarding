import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../context/DataContext';
import { formatName, businessTodayDate, toDateStr, BUSINESS_TIME_ZONE } from '../utils/dateUtils';
import { activeBoardings, calculateNet, nightStays } from '../utils/calculations';
import { siteDate, formatSiteDate, bookingTime } from '../utils/siteClock';
import { getEmployeeNameById } from '../utils/employeeHelpers';

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

// Date utilities. The grid's days are calendar dates; booking times are site clock
// values (#353, ADR-009), placed on the grid by their San Francisco date (siteDate).
function getMonthData(year, month) {
  const firstDay = new Date(year, month, 1); // real-moment: the grid's calendar month
  const lastDay = new Date(year, month + 1, 0); // real-moment: the grid's calendar month
  const daysInMonth = lastDay.getDate(); // real-moment: the grid's calendar month
  const startingDay = firstDay.getDay(); // real-moment: the grid's calendar month

  return { firstDay, lastDay, daysInMonth, startingDay };
}

// A grid day as YYYY-MM-DD (month 0-based), to compare with a booking's siteDate
function dayKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// A booking's San Francisco date, "Oct 29"
function formatDate(iso) {
  return formatSiteDate(iso, { month: 'short', day: 'numeric' });
}

// A booking's date and, when known, its time: "Oct 29 10:00 AM PT"
function formatDateAndTime(iso, ampm) {
  return [formatDate(iso), bookingTime(iso, ampm)].filter(Boolean).join(' ');
}

// The bookings on a day, from arrival day to departure day
function bookingsOnDay(bookings, key) {
  return bookings.filter(b => siteDate(b.arrival_datetime) <= key && key <= siteDate(b.departure_datetime));
}

// ─── Print helpers ───────────────────────────────────────────────────────────

/** Build a sorted array of {year, month, day} objects for [startDate, endDate]. */
function eachDayInRange(startDate, endDate) {
  const days = [];
  // real-moment: the picked print range's calendar days
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  // real-moment: the picked print range's calendar days
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1); // real-moment: the picked print range's calendar days
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
function PrintView({ days, getBookingsForDayFn, getNightTotals }) {
  useEffect(() => {
    console.log(`[print] PrintView mounted — ${days.length} days in range`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!days.length) return null;

  // When it was printed, in San Francisco time (#350)
  const now = new Date();
  const part = (opts) => now.toLocaleString('en-US', { timeZone: BUSINESS_TIME_ZONE, ...opts }); // real-moment: the time it was printed
  const timeStr  = part({ hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  const printedAt = `Printed at ${timeStr} ${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })} ${part({ year: 'numeric' })}`;

  return (
    <div id="calendar-print-view" style={{ fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #calendar-print-view { display: block !important; }
          .print-day { page-break-inside: avoid; margin-bottom: 24px; }
          @page { margin-bottom: 36px; }
        }
        #calendar-print-view { display: none; }
      `}</style>
      <div style={{ position: 'fixed', bottom: '8px', left: 0, right: 0, textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        {printedAt}
      </div>

      {days.map((date) => {
        const dateStr = toDateStr(date);
        const bookings = getBookingsForDayFn(dateStr);
        if (bookings.length === 0) return null;

        // real-moment: the printed day's calendar date
        const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

        const arriving  = bookings.filter(b => siteDate(b.arrival_datetime) === dateStr);
        const departing = bookings.filter(b => siteDate(b.departure_datetime) === dateStr);
        const staying   = bookings.filter(b => siteDate(b.arrival_datetime) !== dateStr && siteDate(b.departure_datetime) !== dateStr);

        const { overnightCount, grossTotal, netPct, netTotal } = getNightTotals(dateStr);

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
              {mode === 'arriving'  && [bookingTime(b.arrival_datetime, b.arrival_ampm), '→', formatDateAndTime(b.departure_datetime, b.departure_ampm)].filter(Boolean).join(' ')}
              {mode === 'departing' && [formatDateAndTime(b.arrival_datetime, b.arrival_ampm), '→', bookingTime(b.departure_datetime, b.departure_ampm)].filter(Boolean).join(' ')}
              {mode === 'staying'   && `Since ${formatDateAndTime(b.arrival_datetime, b.arrival_ampm)} → ${formatDateAndTime(b.departure_datetime, b.departure_ampm)}`}
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
  const { dogs, boardings: allBoardings, getNetPercentageForDate, nightAssignments, settings } = useData();
  // A cancelled boarding has no days or nights (REQ-108)
  const boardings = useMemo(() => activeBoardings(allBoardings), [allBoardings]);
  const [currentDate, setCurrentDate] = useState(() => {
    const today = businessTodayDate();
    return new Date(today.getFullYear(), today.getMonth(), 1); // real-moment: the grid's calendar month
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printRange, setPrintRange] = useState(null); // { from, to } as 'YYYY-MM-DD' strings

  const year = currentDate.getFullYear(); // real-moment: the grid's calendar month
  const month = currentDate.getMonth(); // real-moment: the grid's calendar month
  const { daysInMonth, startingDay } = getMonthData(year, month);

  // real-moment: the grid's calendar month
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Get dog info by ID
  const getDog = (dogId) => dogs.find(d => d.id === dogId);
  const getDogName = (dogId) => formatName(getDog(dogId)?.name) || 'Unknown';

  // Tonight's dogs and money from the shared calculation, as on Payroll (#342)
  const getNightTotals = (dateStr) => {
    const stays = nightStays(dogs, boardings, dateStr);
    const grossTotal = stays.reduce((sum, s) => sum + s.rate, 0);
    const netPct = getNetPercentageForDate(dateStr);
    return { overnightCount: stays.length, grossTotal, netPct, netTotal: calculateNet(grossTotal, netPct).toFixed(2) };
  };

  // Transform boardings to calendar format
  const calendarBookings = useMemo(() => {
    return boardings.map(b => ({
      id: b.id,
      dog_name: getDogName(b.dogId),
      dogId: b.dogId,
      arrival_datetime: b.arrivalDateTime,
      departure_datetime: b.departureDateTime,
      arrival_ampm: b.arrivalAmPm ?? null,
      departure_ampm: b.departureAmPm ?? null,
    }));
  }, [boardings, dogs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter bookings that overlap with current month
  const monthBookings = useMemo(() => {
    const monthStart = dayKey(year, month, 1);
    const monthEnd = dayKey(year, month, daysInMonth);

    return calendarBookings.filter(b =>
      siteDate(b.arrival_datetime) <= monthEnd && siteDate(b.departure_datetime) >= monthStart);
  }, [calendarBookings, year, month, daysInMonth]);

  // Get bookings for a specific day
  const getBookingsForDay = (day) => bookingsOnDay(monthBookings, dayKey(year, month, day));

  // Calculate bar positions for a day
  const getBarSegments = (day) => {
    const bookings = getBookingsForDay(day);
    const key = dayKey(year, month, day);

    return bookings.map(b => {
      const isStart = siteDate(b.arrival_datetime) === key;
      const isEnd = siteDate(b.departure_datetime) === key;

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

  // Get bookings for any date, YYYY-MM-DD (used by print view)
  const getBookingsForAnyDay = (dateStr) => bookingsOnDay(calendarBookings, dateStr);

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
    const range = { startDate: new Date(fy, fm - 1, fd), endDate: new Date(ty, tm - 1, td) }; // real-moment: the picked print range
    console.log(`[print] handlePrint → ${from} to ${to}`);
    setPrintRange(range);
    setShowPrintModal(false);
  };

  // Default print range = today → today+7
  const printToday    = businessTodayDate();
  const printWeekOut  = new Date(printToday.getFullYear(), printToday.getMonth(), printToday.getDate() + 7); // real-moment: today's calendar date
  const printDefaultFrom = toDateStr(printToday);
  const printDefaultTo   = toDateStr(printWeekOut);

  // Navigation
  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1)); // real-moment: the grid's calendar days
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1)); // real-moment: the grid's calendar days
  const goToToday = () => {
    const today = businessTodayDate();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1)); // real-moment: the grid's calendar days
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
  const selectedDateObj = selectedDate ? new Date(year, month, selectedDate) : null; // real-moment: the grid's calendar days
  const selectedDateStr = selectedDate ? dayKey(year, month, selectedDate) : null;

  const getStatus = (booking) => {
    if (!selectedDateStr) return '';
    if (siteDate(booking.arrival_datetime) === selectedDateStr) return 'arriving';
    if (siteDate(booking.departure_datetime) === selectedDateStr) return 'departing';
    return 'staying';
  };

  const arriving = selectedDayBookings.filter(b => getStatus(b) === 'arriving');
  const staying = selectedDayBookings.filter(b => getStatus(b) === 'staying');
  const departing = selectedDayBookings.filter(b => getStatus(b) === 'departing');

  const { overnightCount, grossTotal, netPct: netPercentage, netTotal } = selectedDateStr
    ? getNightTotals(selectedDateStr)
    : { overnightCount: 0, grossTotal: 0, netPct: 65, netTotal: '0.00' };

  // Check if a day is today (in San Francisco)
  const today = businessTodayDate();
  const isToday = (day) => {
    return dayKey(year, month, day) === toDateStr(today);
  };
  const todayDay = today.getDate(); // real-moment: today's calendar date

  // Look up overnight staff assignment for a given calendar day
  const getStaffForDay = (day) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const assignment = nightAssignments?.find(x => x.date === dateStr);
    if (!assignment) return null;
    if (assignment.employeeId === null) return { name: 'N/A', isNA: true };
    const name = getEmployeeNameById(settings?.employees ?? [], assignment.employeeId) || 'Unknown';
    return { name, isNA: false };
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
                  // real-moment: the selected grid day
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
                          {[bookingTime(b.arrival_datetime, b.arrival_ampm), '→', formatDate(b.departure_datetime)].filter(Boolean).join(' ')}
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
                          {[formatDate(b.arrival_datetime), '→', bookingTime(b.departure_datetime, b.departure_ampm)].filter(Boolean).join(' ')}
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

      {/* Overnight Staff Calendar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-semibold text-slate-700">Overnight Staff</h3>
        </div>
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>
        <div className="divide-y divide-slate-100">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 divide-x divide-slate-100">
              {week.map((day, dayIndex) => {
                const isWeekend = dayIndex === 0 || dayIndex === 6;
                const isTodayCell = day && isToday(day);
                const staff = day ? getStaffForDay(day) : null;
                const colors = staff && !staff.isNA ? stringToColor(staff.name) : null;

                return (
                  <div
                    key={dayIndex}
                    className={`
                      min-h-12 p-1.5 flex flex-col gap-1
                      ${!day ? 'bg-slate-50' : ''}
                      ${isWeekend && day ? 'bg-slate-50/50' : ''}
                    `}
                  >
                    {day && (
                      <>
                        <div className={`text-right text-xs font-medium px-0.5 ${isTodayCell ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {isTodayCell ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white rounded-full text-[10px]">
                              {day}
                            </span>
                          ) : day}
                        </div>
                        {staff && (
                          staff.isNA ? (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 text-center leading-tight">
                              N/A
                            </span>
                          ) : (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full truncate leading-tight"
                              style={{
                                backgroundColor: colors.bg,
                                color: colors.text,
                                border: `1px solid ${colors.border}`,
                              }}
                            >
                              {staff.name}
                            </span>
                          )
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
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
          <span className="inline-flex items-center justify-center w-4 h-4 bg-indigo-600 text-white rounded-full text-[10px]">{todayDay}</span> Today
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
          getNightTotals={getNightTotals}
        />,
        document.body
      )}
    </div>
  );
}
