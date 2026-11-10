import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import DateNavigator from '../components/DateNavigator';
import DeletePaymentDialog from '../components/DeletePaymentDialog';
import PaymentDialog from '../components/PaymentDialog';
import { getDateRange, businessTodayDate, daysBetween, toDateStr } from '../utils/dateUtils';
import { calculateDaytimeGross, calculateGross, calculateNet } from '../utils/calculations';
import { buildOutstanding } from '../utils/payroll';
import { deletedLine } from '../utils/paidNights';

export default function PayrollPage() {
  const {
    dogs,
    boardings,
    payments,
    deletedPayments = [],
    getNetPercentageForDate,
    getNightAssignment,
    nightAssignments,
    addPayment,
    deletePayment,
  } = useData();

  // Default to last 30 days, but restore from localStorage if available
  const [startDate, setStartDate] = useState(() => {
    const saved = localStorage.getItem('payroll-start-date');
    if (saved) {
      const date = new Date(saved + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    const date = businessTodayDate();
    date.setDate(date.getDate() - 29);
    return date;
  });

  const [endDate, setEndDate] = useState(() => {
    const saved = localStorage.getItem('payroll-end-date');
    if (saved) {
      const date = new Date(saved + 'T00:00:00');
      if (!isNaN(date.getTime())) return date;
    }
    return businessTodayDate();
  });

  // Persist dates to localStorage
  useEffect(() => {
    localStorage.setItem('payroll-start-date', toDateStr(startDate));
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('payroll-end-date', toDateStr(endDate));
  }, [endDate]);

  const [payConfirm, setPayConfirm] = useState({ isOpen: false, employee: null });
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, payment: null });
  const [pageError, setPageError] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const daysDiff = daysBetween(startDate, endDate) + 1;
  const dates = getDateRange(startDate, daysDiff);

  // Daytime follow-on credit for a night date: sum day rates of the dogs boarded that night × net%
  const computeDaytimeNet = (dateStr) => {
    const a = nightAssignments.find(x => x.date === dateStr);
    if (!a?.workedFollowingDay) return 0;
    return calculateNet(calculateDaytimeGross(dogs, boardings, dateStr), getNetPercentageForDate(dateStr));
  };

  // Calculate net for a specific date
  const calculateDayNet = (dateStr) => calculateNet(calculateGross(dogs, boardings, dateStr), getNetPercentageForDate(dateStr));

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

  // What each employee is owed, in whole cents per night; a night paid to anyone is left out (#370)
  const { outstanding, notices } = buildOutstanding({
    dates,
    assigneeFor: getNightAssignment,
    nightNet: calculateDayNet,
    daytimeNet: computeDaytimeNet,
    followingDayFor: (night) => !!nightAssignments.find((x) => x.date === night)?.workedFollowingDay,
    payments,
  });
  const outstandingEmployees = Object.keys(outstanding).sort();

  const formatNoticeDate = (dateStr) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const handleMarkAsPaid = (employeeName) => {
    setPageError(null);
    setPayConfirm({ isOpen: true, employee: employeeName });
  };

  const payData = payConfirm.employee ? outstanding[payConfirm.employee] : null;

  // A refresh after a refused save can leave the employee with nothing to pay: close the box,
  // and the page shows the error instead.
  useEffect(() => {
    if (payConfirm.isOpen && !payData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPayConfirm({ isOpen: false, employee: null });
    }
  }, [payConfirm.isOpen, payData]);

  // Throws on a failed save so the box stays open with the error (#370).
  const confirmPayment = async (selectedDates, amount, nightAmounts) => {
    const sortedDates = [...selectedDates].sort();
    try {
      await addPayment({
        employeeName: payConfirm.employee,
        startDate: sortedDates[0],
        endDate: sortedDates[sortedDates.length - 1],
        amount,
        nights: sortedDates.length,
        dates: sortedDates,
        nightAmounts,
        // What this page priced with "worked following day": the database refuses the payment if
        // a tick changed since (#389, Q3).
        followingDayNights: (payData?.followingDayNights || []).filter((d) => sortedDates.includes(d)),
      });
    } catch (err) {
      console.error('Failed to add payment:', err);
      setPageError(err?.message || 'The payment was not saved.');
      throw err;
    }
    setPageError(null);
    setPayConfirm({ isOpen: false, employee: null });
  };

  const handleDeletePayment = (payment) => {
    setPageError(null);
    setDeleteConfirm({ isOpen: true, payment });
  };

  // Delete is the way to fix a payment, so a failed delete must show (#370). It's a soft delete
  // with an optional note: the payment stays in the history (#389).
  const confirmDelete = async (note = '') => {
    if (deleteConfirm.payment) {
      try {
        await deletePayment(deleteConfirm.payment.id, note);
      } catch (err) {
        console.error('Failed to delete payment:', err);
        setPageError(`The payment was not deleted: ${err?.message || 'unknown error'}`);
      }
    }
    setDeleteConfirm({ isOpen: false, payment: null });
  };

  // Sort payments by date (most recent first)
  const sortedPayments = [...payments].sort((a, b) =>
    b.paidDate.localeCompare(a.paidDate)
  );

  const totalOutstanding = Object.values(outstanding).reduce((sum, emp) => sum + emp.amountCents, 0) / 100;

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

      {pageError && !(payConfirm.isOpen && payData) && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">
          {pageError}
        </div>
      )}

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

        {notices.length > 0 && (
          <ul className="mb-4 space-y-2" aria-label="Nights that can't be paid here">
            {notices.map((notice) => (
              <li key={notice.night} className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                {notice.kind === 'no-amount'
                  ? `${formatNoticeDate(notice.night)} (${notice.assignedTo}) can't be paid yet: a dog boarded that night has no rate. Fix the rate on the booking site.`
                  : `${formatNoticeDate(notice.night)} is assigned to ${notice.assignedTo} but was paid to ${notice.paidTo || 'a removed employee'}. Delete ${notice.paidTo ? `${notice.paidTo}’s` : 'that'} payment to change it.`}
              </li>
            ))}
          </ul>
        )}

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
                      <span className="text-slate-500">Night pay</span>
                      <span className="font-semibold text-slate-700">{formatCurrency((emp.amountCents - emp.daytimeCents) / 100)}</span>
                    </div>
                    {emp.daytimeAmount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">+ Daytime follow-on</span>
                        <span className="font-semibold text-indigo-600">{formatCurrency(emp.daytimeAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                      <span className="text-slate-600 font-medium">Total owed</span>
                      <span className="font-semibold text-amber-600">{formatCurrency(emp.amount)}</span>
                    </div>
                    <div className="pt-1">
                      <span className="text-slate-500 text-xs">Dates: </span>
                      <span className="text-slate-600 text-xs">{formatDateRanges(emp.dates)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleMarkAsPaid(name)}
                    className="mt-4 w-full min-h-[44px] px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] rounded-lg transition-all shadow-sm select-none"
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
          {deletedPayments.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showDeleted}
                onChange={(e) => setShowDeleted(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Show deleted ({deletedPayments.length})
            </label>
          )}
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
          <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-slate-100 -mx-6">
              {sortedPayments.map((payment) => (
                <div key={payment.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-emerald-600">{payment.employeeName.charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{payment.employeeName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Paid {new Date(payment.paidDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-semibold text-emerald-600">{formatCurrency(payment.amount)}</div>
                      <div className="text-xs text-slate-500">{payment.nights} nights</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    <span className="text-slate-400">Dates:</span> {formatDateRanges(payment.dates)}
                  </div>
                  <button
                    onClick={() => handleDeletePayment(payment)}
                    className="mt-3 min-h-[44px] w-full px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg transition-all select-none"
                  >
                    Delete Payment
                  </button>
                </div>
              ))}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block overflow-x-auto">
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
          </>
        )}
      </div>

      {/* Deleted payments: history only, never counted (#389) */}
      {showDeleted && deletedPayments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Deleted payments</h2>
          <ul className="divide-y divide-slate-100" aria-label="Deleted payments">
            {deletedPayments.map((payment) => (
              <li key={payment.id} data-testid="deleted-payment" className="py-3 text-sm">
                <div className="line-through text-slate-400 flex flex-wrap gap-x-3">
                  <span className="font-medium">{payment.employeeName || 'Removed employee'}</span>
                  <span className="tabular-nums">{formatCurrency(payment.amount)}</span>
                  <span>{payment.nights} {payment.nights === 1 ? 'night' : 'nights'}: {formatDateRanges(payment.dates)}</span>
                  <span>Paid {new Date(payment.paidDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{deletedLine(payment)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Payment Dialog */}
      <PaymentDialog
        isOpen={payConfirm.isOpen}
        employee={payConfirm.employee}
        outstandingData={payData}
        onConfirm={confirmPayment}
        onCancel={() => setPayConfirm({ isOpen: false, employee: null })}
        formatCurrency={formatCurrency}
      />

      {/* Delete Confirmation Dialog: a soft delete with an optional note (#389) */}
      <DeletePaymentDialog
        key={deleteConfirm.payment?.id ?? 'none'}
        isOpen={deleteConfirm.isOpen}
        message={deleteConfirm.payment ? `Delete payment of ${formatCurrency(deleteConfirm.payment.amount)} to ${deleteConfirm.payment.employeeName}? Its nights become unpaid and can be paid again. The payment stays in the history, marked deleted.` : ''}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, payment: null })}
      />
    </div>
  );
}
