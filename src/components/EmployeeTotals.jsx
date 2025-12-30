import { useData } from '../context/DataContext';
import { getDateRange, isOvernight } from '../utils/dateUtils';

export default function EmployeeTotals({ startDate }) {
  const { dogs, boardings, settings, nightAssignments } = useData();

  const dates = getDateRange(startDate.toISOString().split('T')[0], 14);

  const calculateDayNet = (dateStr) => {
    let gross = 0;
    for (const dog of dogs) {
      const dogBoardings = boardings.filter(b => b.dogId === dog.id);
      for (const boarding of dogBoardings) {
        if (isOvernight(boarding, dateStr)) {
          gross += dog.nightRate;
          break;
        }
      }
    }
    return gross * (settings.netPercentage / 100);
  };

  // Calculate totals per employee for the displayed date range
  const employeeTotals = {};

  for (const dateStr of dates) {
    const assignment = nightAssignments.find(a => a.date === dateStr);
    if (assignment && assignment.employeeName) {
      const net = calculateDayNet(dateStr);
      if (!employeeTotals[assignment.employeeName]) {
        employeeTotals[assignment.employeeName] = { nights: 0, earnings: 0 };
      }
      employeeTotals[assignment.employeeName].nights += 1;
      employeeTotals[assignment.employeeName].earnings += net;
    }
  }

  const employeeNames = Object.keys(employeeTotals).sort();

  if (employeeNames.length === 0) {
    return null;
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="mt-6 bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Employee Totals</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {employeeNames.map((name) => (
          <div key={name} className="bg-gray-50 rounded-lg p-4">
            <div className="font-medium text-gray-900">{name}</div>
            <div className="mt-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>Nights worked:</span>
                <span className="font-medium">{employeeTotals[name].nights}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span>Total earnings:</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(employeeTotals[name].earnings)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
