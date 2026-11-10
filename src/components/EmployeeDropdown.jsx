import { useState } from 'react';
import { useData } from '../context/DataContext';
import { getEmployeeName, isEmployeeActive } from '../utils/employeeHelpers';
import { NIGHT_PAID_MESSAGE } from '../utils/paidNights';

// A calendar day ('2026-11-06') as "Nov 6"; built and shown in the same zone, so no shift.
const shortDay = (day) =>
  new Date(day + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function EmployeeDropdown({ date }) {
  const { settings, getNightAssignment, setNightAssignment, getWorkedFollowingDay, setWorkedFollowingDay, getNightPayment } = useData();
  const [saving, setSaving] = useState(false);
  const [checkboxSaving, setCheckboxSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedEmployee = getNightAssignment(date);
  const workedFollowingDay = getWorkedFollowingDay ? getWorkedFollowingDay(date) : null;
  const payment = getNightPayment ? getNightPayment(date) : null;

  const followingDay = (() => {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  })();

  const handleChange = async (e) => {
    const newValue = e.target.value;
    setSaving(true);
    setError(null);
    try {
      await setNightAssignment(date, newValue);
    } catch (err) {
      console.error('Failed to set assignment:', err);
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleFollowingDayChange = async (e) => {
    const checked = e.target.checked;
    setCheckboxSaving(true);
    try {
      await setWorkedFollowingDay(date, checked ? true : null);
    } catch (err) {
      console.error('Failed to set worked_following_day:', err);
      setError(err.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setCheckboxSaving(false);
    }
  };

  // Filter to only active employees, but include currently selected even if inactive
  const availableEmployees = settings.employees.filter(emp =>
    isEmployeeActive(emp) || getEmployeeName(emp) === selectedEmployee
  );

  const showFollowingDayCheckbox = selectedEmployee && selectedEmployee !== 'N/A';

  // A paid night is locked until its payment is deleted (#389): shown as text, not a control.
  if (payment) {
    return (
      <div className="space-y-1">
        <div
          title={NIGHT_PAID_MESSAGE}
          className="w-full text-xs px-2 py-1.5 border border-emerald-200 rounded-lg bg-emerald-50 text-slate-700 flex items-center gap-1.5"
        >
          <svg className="w-3 h-3 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>{selectedEmployee}</span>
        </div>
        <p className="text-xs text-emerald-700">Paid {shortDay(payment.paidDate)}</p>
        {workedFollowingDay && (
          <p className="text-xs text-slate-500">Day boarding {followingDay}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <select
        value={selectedEmployee}
        onChange={handleChange}
        disabled={saving}
        className={`w-full text-xs px-2 py-1.5 border rounded-lg bg-white text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
          error ? 'border-red-500 bg-red-50' : 'border-slate-300'
        } ${saving ? 'opacity-50 cursor-wait' : ''}`}
        title={error || ''}
      >
        <option value="">—</option>
        <option value="N/A">N/A</option>
        {availableEmployees.map((employee) => {
          const name = getEmployeeName(employee);
          return (
            <option key={name} value={name}>
              {name}
            </option>
          );
        })}
      </select>

      {showFollowingDayCheckbox && (
        <label className={`flex items-center gap-1.5 cursor-pointer ${checkboxSaving ? 'opacity-50' : ''}`}>
          <input
            type="checkbox"
            checked={!!workedFollowingDay}
            onChange={handleFollowingDayChange}
            disabled={checkboxSaving}
            className="w-3 h-3 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-xs text-slate-500">Day boarding {followingDay}</span>
        </label>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
