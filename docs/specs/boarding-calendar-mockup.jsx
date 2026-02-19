import React, { useState, useMemo } from 'react';

// Actual boarding data from the user
const boardingData = [
  { id: '1', dog_name: 'lionel', arrival_datetime: '2026-01-10T14:00:00', departure_datetime: '2026-01-11T09:00:00' },
  { id: '2', dog_name: 'asucar', arrival_datetime: '2026-01-10T14:00:00', departure_datetime: '2026-01-11T09:00:00' },
  { id: '3', dog_name: 'hank', arrival_datetime: '2026-01-09T14:00:00', departure_datetime: '2026-01-11T09:00:00' },
  { id: '4', dog_name: 'freddy', arrival_datetime: '2026-01-09T14:00:00', departure_datetime: '2026-01-11T09:00:00' },
  { id: '5', dog_name: 'millie', arrival_datetime: '2026-01-09T14:00:00', departure_datetime: '2026-01-11T09:00:00' },
  { id: '6', dog_name: 'lilly', arrival_datetime: '2026-01-07T14:00:00', departure_datetime: '2026-01-08T09:00:00' },
  { id: '7', dog_name: 'captain', arrival_datetime: '2026-01-02T14:00:00', departure_datetime: '2026-01-05T09:00:00' },
  { id: '8', dog_name: 'brinkley', arrival_datetime: '2025-12-31T14:00:00', departure_datetime: '2026-01-01T09:00:00' },
  { id: '9', dog_name: 'buddy d', arrival_datetime: '2025-12-31T14:00:00', departure_datetime: '2026-01-02T10:00:00' },
  { id: '10', dog_name: 'darwin', arrival_datetime: '2025-12-30T14:00:00', departure_datetime: '2026-01-02T09:00:00' },
  { id: '11', dog_name: 'merlin', arrival_datetime: '2025-12-30T14:00:00', departure_datetime: '2026-01-02T09:00:00' },
  { id: '12', dog_name: 'Benny B.', arrival_datetime: '2025-12-28T20:00:00', departure_datetime: '2025-12-29T15:00:00' },
  { id: '13', dog_name: 'luna', arrival_datetime: '2025-12-28T20:00:00', departure_datetime: '2025-12-29T15:00:00' },
  { id: '14', dog_name: 'lionel', arrival_datetime: '2025-12-28T20:00:00', departure_datetime: '2025-12-29T15:00:00' },
  { id: '15', dog_name: 'john mclain', arrival_datetime: '2025-12-28T14:00:00', departure_datetime: '2026-01-02T09:00:00' },
  { id: '16', dog_name: 'carmelo', arrival_datetime: '2025-12-28T14:00:00', departure_datetime: '2026-01-02T09:00:00' },
  { id: '17', dog_name: 'maxi', arrival_datetime: '2025-12-28T14:00:00', departure_datetime: '2026-01-01T09:00:00' },
  { id: '18', dog_name: 'lilly', arrival_datetime: '2025-12-28T14:00:00', departure_datetime: '2026-01-06T09:00:00' },
  { id: '19', dog_name: 'Maverick B', arrival_datetime: '2025-12-28T14:00:00', departure_datetime: '2026-01-01T09:00:00' },
  { id: '20', dog_name: 'john mclain', arrival_datetime: '2025-12-26T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '21', dog_name: 'luna', arrival_datetime: '2025-12-24T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '22', dog_name: 'lilly', arrival_datetime: '2025-12-24T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '23', dog_name: 'winston', arrival_datetime: '2025-12-23T20:00:00', departure_datetime: '2025-12-26T15:00:00' },
  { id: '24', dog_name: 'marley', arrival_datetime: '2025-12-23T20:00:00', departure_datetime: '2025-12-27T15:00:00' },
  { id: '25', dog_name: 'mochi', arrival_datetime: '2025-12-23T20:00:00', departure_datetime: '2025-12-27T15:00:00' },
  { id: '26', dog_name: 'elouise', arrival_datetime: '2025-12-22T20:00:00', departure_datetime: '2025-12-27T15:00:00' },
  { id: '27', dog_name: 'Benny B.', arrival_datetime: '2025-12-22T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '28', dog_name: 'Maverick B', arrival_datetime: '2025-12-22T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '29', dog_name: 'lionel', arrival_datetime: '2025-12-21T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '30', dog_name: 'corky', arrival_datetime: '2025-12-21T20:00:00', departure_datetime: '2025-12-22T15:00:00' },
  { id: '31', dog_name: 'maxi', arrival_datetime: '2025-12-21T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '32', dog_name: 'maverick s', arrival_datetime: '2025-12-16T20:00:00', departure_datetime: '2025-12-18T15:00:00' },
  { id: '33', dog_name: 'carmelo', arrival_datetime: '2025-12-14T20:00:00', departure_datetime: '2025-12-28T15:00:00' },
  { id: '34', dog_name: 'stella m', arrival_datetime: '2025-12-14T20:00:00', departure_datetime: '2025-12-26T15:00:00' },
  { id: '35', dog_name: 'brinkley', arrival_datetime: '2025-12-13T20:00:00', departure_datetime: '2025-12-14T15:00:00' },
  { id: '36', dog_name: 'Benny B.', arrival_datetime: '2025-12-12T20:00:00', departure_datetime: '2025-12-13T15:00:00' },
  { id: '37', dog_name: 'stella m', arrival_datetime: '2025-12-09T20:00:00', departure_datetime: '2025-12-14T15:00:00' },
  { id: '38', dog_name: 'Benny B.', arrival_datetime: '2025-12-08T20:00:00', departure_datetime: '2025-12-11T15:00:00' },
  { id: '39', dog_name: 'Gulliver', arrival_datetime: '2025-12-05T20:00:00', departure_datetime: '2025-12-06T15:00:00' },
  { id: '40', dog_name: 'Maverick B', arrival_datetime: '2025-12-05T20:00:00', departure_datetime: '2025-12-12T15:00:00' },
  { id: '41', dog_name: 'peanut', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-01T15:00:00' },
  { id: '42', dog_name: 'mochi', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-01T15:00:00' },
  { id: '43', dog_name: 'merlin', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-03T15:00:00' },
  { id: '44', dog_name: 'maxi', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-02T15:00:00' },
  { id: '45', dog_name: 'maverick s', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-03T15:00:00' },
  { id: '46', dog_name: 'marlee', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-01T15:00:00' },
  { id: '47', dog_name: 'lionel', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-03T15:00:00' },
  { id: '48', dog_name: 'darwin', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-03T15:00:00' },
  { id: '49', dog_name: 'stella m', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-01T15:00:00' },
  { id: '50', dog_name: 'skittles', arrival_datetime: '2025-11-30T20:00:00', departure_datetime: '2025-12-02T15:00:00' },
  { id: '51', dog_name: 'lionel', arrival_datetime: '2025-11-28T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '52', dog_name: 'peanut', arrival_datetime: '2025-11-28T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '53', dog_name: 'marlee', arrival_datetime: '2025-11-27T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '54', dog_name: 'mochi', arrival_datetime: '2025-11-27T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '55', dog_name: 'maxi', arrival_datetime: '2025-11-27T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '56', dog_name: 'stella m', arrival_datetime: '2025-11-27T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '57', dog_name: 'corky', arrival_datetime: '2025-11-27T20:00:00', departure_datetime: '2025-11-29T15:00:00' },
  { id: '58', dog_name: 'skittles', arrival_datetime: '2025-11-26T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '59', dog_name: 'lionel', arrival_datetime: '2025-11-24T20:00:00', departure_datetime: '2025-11-25T15:00:00' },
  { id: '60', dog_name: 'buddy d', arrival_datetime: '2025-11-23T20:00:00', departure_datetime: '2025-11-24T15:00:00' },
  { id: '61', dog_name: 'merlin', arrival_datetime: '2025-11-22T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '62', dog_name: 'maverick s', arrival_datetime: '2025-11-22T20:00:00', departure_datetime: '2025-11-30T15:00:00' },
  { id: '63', dog_name: 'lilly', arrival_datetime: '2025-11-22T20:00:00', departure_datetime: '2025-11-29T15:00:00' },
  { id: '64', dog_name: 'marley', arrival_datetime: '2025-11-21T20:00:00', departure_datetime: '2025-11-23T15:00:00' },
];

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

export default function BoardingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2025, 11, 1)); // December 2025
  const [selectedDate, setSelectedDate] = useState(null);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { daysInMonth, startingDay } = getMonthData(year, month);
  
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  
  // Filter bookings that overlap with current month
  const monthBookings = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    
    return boardingData.filter(b => {
      const arrival = new Date(b.arrival_datetime);
      const departure = new Date(b.departure_datetime);
      return arrival <= monthEnd && departure >= monthStart;
    });
  }, [year, month]);
  
  // Get bookings for a specific day
  const getBookingsForDay = (day) => {
    const date = new Date(year, month, day);
    return monthBookings.filter(b => {
      const arrival = new Date(b.arrival_datetime);
      const departure = new Date(b.departure_datetime);
      arrival.setHours(0, 0, 0, 0);
      const depDate = new Date(departure);
      depDate.setHours(0, 0, 0, 0);
      const checkDate = new Date(date);
      checkDate.setHours(0, 0, 0, 0);
      return checkDate >= arrival && checkDate <= depDate;
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
  const goToToday = () => setCurrentDate(new Date(2025, 11, 1)); // Set to Dec 2025 for demo
  
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
  
  const overnightCount = selectedDayBookings.filter(isOvernight).length;
  const grossTotal = overnightCount * 45; // Assuming $45/night average
  const netTotal = (grossTotal * 0.65).toFixed(2);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Boarding Calendar</h1>
          <p className="text-gray-500 text-sm mt-1">Click a day to see details</p>
        </div>
        
        {/* Navigation */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{monthName}</h2>
            <div className="w-24" /> {/* Spacer for centering */}
          </div>
        </div>
        
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Calendar Grid */}
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar weeks */}
            <div className="divide-y divide-gray-100">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="grid grid-cols-7 divide-x divide-gray-100">
                  {week.map((day, dayIndex) => {
                    const isWeekend = dayIndex === 0 || dayIndex === 6;
                    const isSelected = day === selectedDate;
                    const isToday = day === 31 && month === 11 && year === 2025; // Dec 31, 2025
                    const segments = day ? getBarSegments(day) : [];
                    const moreCount = day ? getMoreCount(day) : 0;
                    
                    return (
                      <div
                        key={dayIndex}
                        onClick={() => day && setSelectedDate(day === selectedDate ? null : day)}
                        className={`
                          min-h-24 p-1 cursor-pointer transition-colors
                          ${!day ? 'bg-gray-50' : ''}
                          ${isWeekend && day ? 'bg-gray-50/50' : ''}
                          ${isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : ''}
                          ${day && !isSelected ? 'hover:bg-gray-50' : ''}
                        `}
                      >
                        {day && (
                          <>
                            <div className={`
                              text-right text-sm font-medium mb-1 px-1
                              ${isToday ? 'text-blue-600' : 'text-gray-700'}
                            `}>
                              {isToday ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs">
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
                                <div className="text-xs text-gray-500 px-1">
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
            lg:w-80 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden
            transition-all duration-200
            ${selectedDate ? 'opacity-100' : 'opacity-50'}
          `}>
            <div className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {selectedDateObj 
                    ? selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
                    : 'Select a day'
                  }
                </h3>
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate(null)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            
            {selectedDate ? (
              <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
                {arriving.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      Arriving ({arriving.length})
                    </h4>
                    <div className="space-y-2">
                      {arriving.map(b => (
                        <div key={b.id} className="p-2 rounded-lg bg-green-50 border border-green-100">
                          <div className="font-medium text-gray-900">{b.dog_name}</div>
                          <div className="text-xs text-gray-500">
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
                          <div className="font-medium text-gray-900">{b.dog_name}</div>
                          <div className="text-xs text-gray-500">
                            Since {formatDate(b.arrival_datetime)} → {formatDate(b.departure_datetime)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {departing.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                      Departing ({departing.length})
                    </h4>
                    <div className="space-y-2">
                      {departing.map(b => (
                        <div key={b.id} className="p-2 rounded-lg bg-orange-50 border border-orange-100">
                          <div className="font-medium text-gray-900">{b.dog_name}</div>
                          <div className="text-xs text-gray-500">
                            {formatDate(b.arrival_datetime)} → {formatTime(b.departure_datetime)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedDayBookings.length === 0 && (
                  <div className="text-center text-gray-400 py-8">
                    No dogs booked
                  </div>
                )}
                
                {selectedDayBookings.length > 0 && (
                  <div className="pt-3 border-t border-gray-100">
                    <div className="text-xs text-gray-500 space-y-1">
                      <div className="flex justify-between">
                        <span>Dogs tonight:</span>
                        <span className="font-medium text-gray-900">{overnightCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gross (est):</span>
                        <span className="font-medium text-gray-900">${grossTotal}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Net (65%):</span>
                        <span className="font-medium text-green-600">${netTotal}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>Click a day to see boarding details</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span> Arriving
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span> Staying
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-orange-500 rounded-full"></span> Departing
          </div>
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-600 text-white rounded-full text-[10px]">31</span> Today
          </div>
        </div>
      </div>
    </div>
  );
}
