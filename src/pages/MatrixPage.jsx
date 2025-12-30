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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Boarding Matrix</h1>
      <DateNavigator startDate={startDate} onDateChange={setStartDate} />
      <BoardingMatrix startDate={startDate} />
      <EmployeeTotals startDate={startDate} />
    </div>
  );
}
