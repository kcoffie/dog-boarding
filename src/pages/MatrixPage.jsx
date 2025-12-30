import { useState } from 'react';
import DateNavigator from '../components/DateNavigator';
import BoardingMatrix from '../components/BoardingMatrix';
import EmployeeTotals from '../components/EmployeeTotals';

export default function MatrixPage() {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });

  const [endDate, setEndDate] = useState(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 13); // 14 days total
    return end;
  });

  // Calculate days between dates (inclusive)
  const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of boarding schedule and revenue</p>
      </div>

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
    </div>
  );
}
