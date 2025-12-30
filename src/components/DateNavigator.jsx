import { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

const MAX_DAYS = 21; // 3 weeks max

export default function DateNavigator({ startDate, endDate, onStartDateChange, onEndDateChange }) {
  const [error, setError] = useState('');

  const handleStartChange = (date) => {
    if (!date) return;

    setError('');

    // Keep current range length, but cap at MAX_DAYS
    const currentRange = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
    const rangeToUse = Math.min(currentRange, MAX_DAYS - 1);

    const newEnd = new Date(date);
    newEnd.setDate(newEnd.getDate() + rangeToUse);

    onStartDateChange(date);
    onEndDateChange(newEnd);
  };

  const handleEndChange = (date) => {
    if (!date) return;

    const daysDiff = Math.floor((date - startDate) / (1000 * 60 * 60 * 24)) + 1;

    if (date < startDate) {
      setError('End date must be after start date');
      return;
    }

    if (daysDiff > MAX_DAYS) {
      setError(`Range cannot exceed ${MAX_DAYS} days (3 weeks)`);
      return;
    }

    setError('');
    onEndDateChange(date);
  };

  const maxEndDate = new Date(startDate);
  maxEndDate.setDate(maxEndDate.getDate() + MAX_DAYS - 1);

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
          <DatePicker
            selected={startDate}
            onChange={handleStartChange}
            selectsStart
            startDate={startDate}
            endDate={endDate}
            dateFormat="MMM d, yyyy"
            className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-500">to</span>
          <DatePicker
            selected={endDate}
            onChange={handleEndChange}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate}
            maxDate={maxEndDate}
            dateFormat="MMM d, yyyy"
            className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
