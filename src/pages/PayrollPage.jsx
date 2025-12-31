import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import DateNavigator from '../components/DateNavigator';
import ConfirmDialog from '../components/ConfirmDialog';
import PaymentDialog from '../components/PaymentDialog';
import { getDateRange, isOvernight } from '../utils/dateUtils';

export default function PayrollPage() {
  const {
    dogs,
    boardings,
    settings,
    payments,
    getNetPercentageForDate,
    getNightAssignment,
    addPayment,
    deletePayment,
    getPaidDatesForEmployee,
  } = useData();

  // Default to last 30 days, but restore from localStorage if available
  const [startDate, setStartDate] = useState(() => {
    const saved = localStorage.getItem('payroll-start-date');
    if (saved) {
      const date = new Date(saved + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - 29);
    return date;
  });

  const [endDate, setEndDate] = useState(() => {
    const saved = localStorage.getItem('payroll-end-date');
    if (saved) {
      const date = new Date(saved + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  });

  // Persist dates to localStorage
  useEffect(() => {
    localStorage.setItem('payroll-start-date', startDate.toISOString().split('T')[0]);
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('payroll-end-date', endDate.toISOString().split('T')[0]);
  }, [endDate]);

  const [payConfirm, setPayConfirm] = useState({ isOpen: false, employee: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, payment: null });

  const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const dates = getDateRange(startDate, daysDiff);

  // Calculate net for a specific date
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
    const percentage = getNetPercentageForDate(dateStr);
    return gross * (percentage / 100);
  };

  // Format dates into ranges
  const formatDateRanges = (dateStrings) => {
    if (dateStrings.length === 0) return '';
    const sorted = [...dateStrings].sort();
    const ranges = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const prevDate = new Date(rangeEnd + 'T00:00:00');
      const currDate = new Date(sorted[i] + 'T00:00:00');
      const diffDays = (currDate - prevDate) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        rangeEnd = sorted[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd });

    const formatShortDate = (dateStr) => {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return ranges.map(({ start, end }) => {
      const startDate = new Date(start + 'T00:00:00');
      const endDate = new Date(end + 'T00:00:00');

      if (start === end) {
        return formatShortDate(start);
      }
      if (startDate.getMonth() === endDate.getMonth()) {
        return `${startDate.toLocaleDateString('en-US', { month: 'short' })} ${startDate.getDate()}-${endDate.getDate()}`;
      }
      return `${formatShortDate(start)} - ${formatShortDate(end)}`;
    }).join(', ');
  };

  // Calculate outstanding amounts per employee
  const calculateOutstanding = () => {
    const outstanding = {};

    for (const dateStr of dates) {
      // Use getNightAssignment to resolve employee name from ID
      const employeeName = getNightAssignment(dateStr);
      if (employeeName && employeeName !== 'N/A') {
        const paidDates = getPaidDatesForEmployee(employeeName);

        // Skip if already paid
        if (paidDates.includes(dateStr)) continue;

        const net = calculateDayNet(dateStr);

        if (!outstanding[employeeName]) {
          outstanding[employeeName] = { nights: 0, amount: 0, dates: [] };
        }
        outstanding[employeeName].nights += 1;
        outstanding[employeeName].amount += net;
        outstanding[employeeName].dates.push(dateStr);
      }
    }

    return outstanding;
  };

  const outstanding = calculateOutstanding();
  const outstandingEmployees = Object.keys(outstanding).sort();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleMarkAsPaid = (employeeName) => {
    setPayConfirm({ isOpen: true, employee: employeeName });
  };

  const confirmPayment = async (selectedDates, amount) => {
    if (selectedDates && selectedDates.length > 0) {
      const sortedDates = [...selectedDates].sort();
      try {
        await addPayment({
          employeeName: payConfirm.employee,
          startDate: sortedDates[0],
          endDate: sortedDates[sortedDates.length - 1],
          amount: amount,
          nights: selectedDates.length,
          dates: selectedDates,
        });
      } catch (err) {
        console.error('Failed to add payment:', err);
      }
    }
    setPayConfirm({ isOpen: false, employee: null });
  };

  const handleDeletePayment = (payment) => {
    setDeleteConfirm({ isOpen: true, payment });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.payment) {
      try {
        await deletePayment(deleteConfirm.payment.id);
      } catch (err) {
        console.error('Failed to delete payment:', err);
      }
    }
    setDeleteConfirm({ isOpen: false, payment: null });
  };

  // Sort payments by date (most recent first)
  const sortedPayments = [...payments].sort((a, b) =>
    b.paidDate.localeCompare(a.paidDate)
  );

  const totalOutstanding = Object.values(outstanding).reduce((sum, emp) => sum + emp.amount, 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payroll</h1>
        <p className="text-slate-500 mt-1">Track and manage employee payments</p>
      </div>

      {/* Date Range Selector */}
      <DateNavigator
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      {/* Outstanding Summary Card */}
      {totalOutstanding > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800">Total Outstanding</p>
              <p className="text-2xl font-bold text-amber-900">{formatCurrency(totalOutstanding)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding Payments Section */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Outstanding Payments</h2>
        </div>

        {outstandingEmployees.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">All caught up!</p>
            <p className="text-slate-500 text-sm mt-1">No outstanding payments for this date range.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {outstandingEmployees.map((name) => {
              const emp = outstanding[name];
              return (
                <div key={name} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                      <span className="text-sm font-semibold text-amber-600">{name.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{name}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Nights worked</span>
                      <span className="font-semibold text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md">{emp.nights}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Amount owed</span>
                      <span className="font-semibold text-amber-600">{formatCurrency(emp.amount)}</span>
                    </div>
                    <div className="pt-2 mt-2 border-t border-slate-200">
                      <span className="text-slate-500 text-xs">Dates: </span>
                      <span className="text-slate-600 text-xs">{formatDateRanges(emp.dates)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleMarkAsPaid(name)}
                    className="mt-4 w-full px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] rounded-lg transition-all shadow-sm"
                  >
                    Mark as Paid
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment History Section */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Payment History</h2>
        </div>

        {sortedPayments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm">No payment history yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date Range</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nights</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid On</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-emerald-600">{payment.employeeName.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-sm font-medium text-slate-900">{payment.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDateRanges(payment.dates)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 text-right tabular-nums">{payment.nights}</td>
                    <td className="px-4 py-3 text-sm font-medium text-emerald-600 text-right tabular-nums">{formatCurrency(payment.amount)}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 text-right">
                      {new Date(payment.paidDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDeletePayment(payment)}
                        className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Dialog */}
      <PaymentDialog
        isOpen={payConfirm.isOpen}
        employee={payConfirm.employee}
        outstandingData={payConfirm.employee ? outstanding[payConfirm.employee] : null}
        onConfirm={confirmPayment}
        onCancel={() => setPayConfirm({ isOpen: false, employee: null })}
        formatCurrency={formatCurrency}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Payment Record"
        message={deleteConfirm.payment ? `Delete payment of ${formatCurrency(deleteConfirm.payment.amount)} to ${deleteConfirm.payment.employeeName}? This will mark those dates as unpaid.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, payment: null })}
      />
    </div>
  );
}
