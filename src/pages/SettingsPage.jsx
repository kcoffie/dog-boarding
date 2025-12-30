import { useState } from 'react';
import { useData } from '../context/DataContext';
import ConfirmDialog from '../components/ConfirmDialog';

export default function SettingsPage() {
  const { settings, updateSettings, addEmployee, deleteEmployee, nightAssignments } = useData();

  const [netPercentage, setNetPercentage] = useState(settings.netPercentage);
  const [percentageError, setPercentageError] = useState('');
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [employeeError, setEmployeeError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, employeeName: '', hasAssignments: false });

  const handlePercentageChange = (e) => {
    const value = e.target.value;
    setNetPercentage(value);
    setPercentageError('');
  };

  const handlePercentageSave = () => {
    const numValue = parseFloat(netPercentage);
    if (isNaN(numValue) || numValue < 0 || numValue > 100) {
      setPercentageError('Must be a number between 0 and 100');
      return;
    }
    updateSettings({ netPercentage: numValue });
    setPercentageError('');
  };

  const handleAddEmployee = (e) => {
    e.preventDefault();
    const trimmedName = newEmployeeName.trim();

    if (!trimmedName) {
      setEmployeeError('Employee name cannot be empty');
      return;
    }

    if (settings.employees.some(emp => emp.toLowerCase() === trimmedName.toLowerCase())) {
      setEmployeeError('An employee with this name already exists');
      return;
    }

    addEmployee(trimmedName);
    setNewEmployeeName('');
    setEmployeeError('');
  };

  const handleDeleteClick = (employeeName) => {
    const hasAssignments = nightAssignments.some(a => a.employeeName === employeeName);
    setDeleteConfirm({ isOpen: true, employeeName, hasAssignments });
  };

  const handleConfirmDelete = () => {
    deleteEmployee(deleteConfirm.employeeName);
    setDeleteConfirm({ isOpen: false, employeeName: '', hasAssignments: false });
  };

  const handleCancelDelete = () => {
    setDeleteConfirm({ isOpen: false, employeeName: '', hasAssignments: false });
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Net Percentage Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Net Percentage</h2>
        <p className="text-gray-600 text-sm mb-4">
          Percentage of gross revenue paid to the employee for each night worked.
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={netPercentage}
                onChange={handlePercentageChange}
                onBlur={handlePercentageSave}
                onKeyDown={(e) => e.key === 'Enter' && handlePercentageSave()}
                className={`w-24 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  percentageError ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              <span className="text-gray-600">%</span>
            </div>
            {percentageError && (
              <p className="text-red-500 text-sm mt-1">{percentageError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Employees Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Employees</h2>

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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  employeeError ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {employeeError && (
                <p className="text-red-500 text-sm mt-1">{employeeError}</p>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Add
            </button>
          </div>
        </form>

        {/* Employee List */}
        {settings.employees.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No employees added yet</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {settings.employees.map((employee) => (
              <li key={employee} className="flex items-center justify-between py-3">
                <span className="text-gray-900">{employee}</span>
                <button
                  onClick={() => handleDeleteClick(employee)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  Delete
                </button>
              </li>
            ))}
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
