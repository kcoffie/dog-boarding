import { useState, useEffect } from 'react';
import SummaryCards from '../components/SummaryCards';
import DateNavigator from '../components/DateNavigator';
import BoardingMatrix from '../components/BoardingMatrix';
import EmployeeTotals from '../components/EmployeeTotals';
import RevenueView from '../components/RevenueView';

export default function MatrixPage() {
  const [startDate, setStartDate] = useState(() => {
    const saved = localStorage.getItem('dashboard-start-date');
    if (saved) {
      const date = new Date(saved + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const [endDate, setEndDate] = useState(() => {
    const saved = localStorage.getItem('dashboard-end-date');
    if (saved) {
      const date = new Date(saved + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 13); // 14 days total
    return end;
  });

  // Persist dates to localStorage
  useEffect(() => {
    localStorage.setItem('dashboard-start-date', startDate.toISOString().split('T')[0]);
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('dashboard-end-date', endDate.toISOString().split('T')[0]);
  }, [endDate]);

  // Calculate days between dates (inclusive)
  const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of boarding schedule and revenue</p>
      </div>

      {/* Summary Cards */}
      <SummaryCards startDate={startDate} days={daysDiff} />

      {/* Date Navigator */}
      <DateNavigator
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* Boarding Matrix */}
      <BoardingMatrix startDate={startDate} days={daysDiff} />

      {/* Employee Totals */}
      <EmployeeTotals startDate={startDate} days={daysDiff} />

      {/* Revenue View */}
      <RevenueView startDate={startDate} days={daysDiff} />
    </div>
  );
}
