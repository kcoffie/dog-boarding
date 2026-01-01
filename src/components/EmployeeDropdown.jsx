import { useState } from 'react';
import { useData } from '../context/DataContext';
import { getEmployeeName, isEmployeeActive } from '../utils/employeeHelpers';

export default function EmployeeDropdown({ date }) {
  const { settings, getNightAssignment, setNightAssignment } = useData();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedEmployee = getNightAssignment(date);

  const handleChange = async (e) => {
    const newValue = e.target.value;
    setSaving(true);
    setError(null);
    try {
      await setNightAssignment(date, newValue);
    } catch (err) {
      console.error('Failed to set assignment:', err);
      setError(err.message);
      // Reset dropdown to previous value after brief error display
      setTimeout(() => setError(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Filter to only active employees, but include currently selected even if inactive
  const availableEmployees = settings.employees.filter(emp =>
    isEmployeeActive(emp) || getEmployeeName(emp) === selectedEmployee
  );

  return (
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
  );
}
