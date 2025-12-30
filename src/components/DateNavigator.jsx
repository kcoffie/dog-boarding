import { useState } from 'react';
import { toDateInputValue } from '../utils/dateUtils';

const MAX_DAYS = 21; // 3 weeks max

export default function DateNavigator({ startDate, endDate, onStartDateChange, onEndDateChange }) {
  const [error, setError] = useState('');

  const toInputDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  const handleStartChange = (e) => {
    const newStart = new Date(e.target.value + 'T00:00:00');
    if (isNaN(newStart.getTime())) return;

    setError('');

    // Keep current range length, but cap at MAX_DAYS
    const currentRange = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    const rangeToUse = Math.min(currentRange, MAX_DAYS - 1);

    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + rangeToUse);

    onStartDateChange(newStart);
    onEndDateChange(newEnd);
  };

  const handleEndChange = (e) => {
    const newEnd = new Date(e.target.value + 'T00:00:00');
    if (isNaN(newEnd.getTime())) return;

    const daysDiff = Math.floor((newEnd - startDate) / (1000 * 60 * 60 * 24)) + 1;

    if (newEnd < startDate) {
      setError('End date must be after start date');
      return;
    }

    if (daysDiff > MAX_DAYS) {
      setError(`Range cannot exceed ${MAX_DAYS} days (3 weeks)`);
      return;
    }

    setError('');
    onEndDateChange(newEnd);
  };

  const shiftRange = (days) => {
    const newStart = new Date(startDate);
    const newEnd = new Date(endDate);
    newStart.setDate(newStart.getDate() + days);
    newEnd.setDate(newEnd.getDate() + days);
    onStartDateChange(newStart);
    onEndDateChange(newEnd);
  };

  const handleToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentRange = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    const newEnd = new Date(today);
    newEnd.setDate(newEnd.getDate() + currentRange);
    onStartDateChange(today);
    onEndDateChange(newEnd);
  };

  const buttonClass = "px-3 py-1.5 text-sm font-medium rounded-md transition-colors";
  const navButtonClass = `${buttonClass} text-gray-700 bg-white border border-gray-300 hover:bg-gray-50`;
  const todayButtonClass = `${buttonClass} text-white bg-blue-600 hover:bg-blue-700`;

  const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          <button onClick={() => shiftRange(-7)} className={navButtonClass}>
            ← Week
          </button>
          <button onClick={() => shiftRange(-1)} className={navButtonClass}>
            ← Day
          </button>
          <button onClick={handleToday} className={todayButtonClass}>
            Today
          </button>
          <button onClick={() => shiftRange(1)} className={navButtonClass}>
            Day →
          </button>
          <button onClick={() => shiftRange(7)} className={navButtonClass}>
            Week →
          </button>
        </div>

        {/* Date range inputs */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={toInputDate(startDate)}
            onChange={handleStartChange}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={toInputDate(endDate)}
            min={toInputDate(startDate)}
            max={toInputDate(new Date(startDate.getTime() + (MAX_DAYS - 1) * 24 * 60 * 60 * 1000))}
            onChange={handleEndChange}
            className="px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">({daysDiff} days)</span>
        </div>
      </div>

      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}
    </div>
  );
}
