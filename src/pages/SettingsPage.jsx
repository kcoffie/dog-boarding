import { useState, useEffect } from 'react';
import { useData } from '../context/DataContext';
import ConfirmDialog from '../components/ConfirmDialog';

export default function SettingsPage() {
  const { settings, settingsLoading, sortEmployees, setNetPercentage: saveNetPercentage, addEmployee, deleteEmployee, toggleEmployeeActive, reorderEmployees, nightAssignments } = useData();

  const getEmployeeName = (emp) => typeof emp === 'string' ? emp : emp.name;
  const isEmployeeActive = (emp) => typeof emp === 'string' ? true : emp.active !== false;

  const [netPercentage, setNetPercentage] = useState('');
  const [percentageError, setPercentageError] = useState('');

  // Sync local state when Supabase settings load
  useEffect(() => {
    if (!settingsLoading && settings.netPercentage !== undefined) {
      setNetPercentage(settings.netPercentage);
    }
  }, [settings.netPercentage, settingsLoading]);
  const [useEffectiveDate, setUseEffectiveDate] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [employeeError, setEmployeeError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, employeeName: '', hasAssignments: false });
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handlePercentageChange = (e) => {
    const value = e.target.value;
    setNetPercentage(value);
    setPercentageError('');
  };

  const handlePercentageSave = async () => {
    const numValue = parseFloat(netPercentage);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      setPercentageError('Must be a number between 0 and 100');
      return;
    }
    try {
      if (useEffectiveDate) {
        await saveNetPercentage(numValue, effectiveDate);
      } else {
        await saveNetPercentage(numValue, null);
      }
      setPercentageError('');
    } catch (err) {
      setPercentageError('Failed to save. Please try again.');
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    const trimmedName = newEmployeeName.trim();

    if (!trimmedName) {
      setEmployeeError('Employee name cannot be empty');
      return;
    }

    if (settings.employees.some(emp => getEmployeeName(emp).toLowerCase() === trimmedName.toLowerCase())) {
      setEmployeeError('An employee with this name already exists');
      return;
    }

    try {
      await addEmployee(trimmedName);
      setNewEmployeeName('');
      setEmployeeError('');
    } catch (err) {
      setEmployeeError('Failed to add employee. Please try again.');
    }
  };

  const handleDeleteClick = (employeeName) => {
    // Find employee ID to check assignments
    const employee = settings.employees.find(e => getEmployeeName(e) === employeeName);
    const employeeId = employee?.id;
    const hasAssignments = employeeId ? nightAssignments.some(a => a.employeeId === employeeId) : false;
    setDeleteConfirm({ isOpen: true, employeeName, hasAssignments });
  };

  const handleConfirmDelete = async () => {
    try {
      await deleteEmployee(deleteConfirm.employeeName);
      setDeleteConfirm({ isOpen: false, employeeName: '', hasAssignments: false });
    } catch (err) {
      console.error('Failed to delete employee:', err);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ isOpen: false, employeeName: '', hasAssignments: false });
  };

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    reorderEmployees(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSortEmployees = (direction) => {
    sortEmployees(direction);
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-slate-500 mt-1">Configure your boarding business preferences</p>
      </div>

      {/* Net Percentage Section */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Net Percentage</h2>
            <p className="text-slate-500 text-sm mt-1 mb-4">
              Percentage of gross revenue paid to the employee for each night worked.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={netPercentage}
                    onChange={handlePercentageChange}
                    onKeyDown={(e) => e.key === 'Enter' && handlePercentageSave()}
                    className={`w-24 px-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      percentageError ? 'border-red-500' : 'border-slate-300'
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                </div>
                <button
                  onClick={handlePercentageSave}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
                >
                  Save
                </button>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useEffectiveDate}
                  onChange={(e) => setUseEffectiveDate(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">Apply from specific date (preserve past rates)</span>
              </label>
              {useEffectiveDate && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Effective from:</span>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              )}
              {(settings.netPercentageHistory?.length > 0) && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Rate History</p>
                  <ul className="space-y-1">
                    {[...settings.netPercentageHistory]
                      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
                      .map((entry, i) => (
                        <li key={i} className="text-sm text-slate-600">
                          <span className="font-medium">{entry.percentage}%</span>
                          <span className="text-slate-400"> from {entry.effectiveDate}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
            {percentageError && (
              <p className="text-red-600 text-sm mt-2">{percentageError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Employees Section */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Employees</h2>
            <p className="text-slate-500 text-sm mt-1">
              Manage your staff who can be assigned to overnight shifts.
            </p>
          </div>
        </div>

        {/* Add Employee Form */}
        <form onSubmit={handleAddEmployee} className="mb-6">
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={newEmployeeName}
                onChange={(e) => {
                  setNewEmployeeName(e.target.value);
                  setEmployeeError('');
                }}
                placeholder="Enter employee name"
                className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                  employeeError ? 'border-red-500' : 'border-slate-300'
                }`}
              />
              {employeeError && (
                <p className="text-red-600 text-sm mt-2">{employeeError}</p>
              )}
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-sm"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add
            </button>
          </div>
        </form>

        {/* Sort Buttons */}
        {settings.employees.length > 1 && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => sortEmployees('asc')}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              A-Z
            </button>
            <button
              onClick={() => sortEmployees('desc')}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4" />
              </svg>
              Z-A
            </button>
          </div>
        )}

        {/* Employee List */}
        {settings.employees.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <p className="text-slate-500 text-sm">No employees added yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 -mx-2">
            {settings.employees.map((employee, index) => {
              const name = getEmployeeName(employee);
              const active = isEmployeeActive(employee);
              return (
                <li
                  key={name}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between py-3 px-2 rounded-lg cursor-grab active:cursor-grabbing transition-colors ${
                    draggedIndex === index ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  } ${!active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-300 hover:text-slate-400 select-none">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                      </svg>
                    </span>
                    <span className={`text-sm font-medium ${active ? 'text-slate-900' : 'text-slate-400'}`}>{name}</span>
                    {!active && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleEmployeeActive(name)}
                      className="text-sm font-medium text-amber-600 hover:text-amber-800 transition-colors"
                    >
                      {active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteClick(name)}
                      className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Employee"
        message={
          deleteConfirm.hasAssignments
            ? `"${deleteConfirm.employeeName}" has night assignments. Deleting will remove all their assignments. Are you sure?`
            : `Are you sure you want to delete "${deleteConfirm.employeeName}"?`
        }
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
}
