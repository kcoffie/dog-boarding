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

  const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftRange(-7)}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            Week
          </button>
          <button
            onClick={() => shiftRange(-1)}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Day
          </button>
          <button
            onClick={handleToday}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
          >
            Today
          </button>
          <button
            onClick={() => shiftRange(1)}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Day
            <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => shiftRange(7)}
            className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Week
            <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-slate-200" />

        {/* Date range inputs */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <DatePicker
              selected={startDate}
              onChange={handleStartChange}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              dateFormat="MMM d, yyyy"
              className="w-36 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>
          <span className="text-slate-400 font-medium">to</span>
          <div className="relative">
            <DatePicker
              selected={endDate}
              onChange={handleEndChange}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              maxDate={maxEndDate}
              dateFormat="MMM d, yyyy"
              className="w-36 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            />
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {daysDiff} days
          </span>
        </div>
      </div>

      {error && (
        <p className="text-red-600 text-sm mt-3">{error}</p>
      )}
    </div>
  );
}
