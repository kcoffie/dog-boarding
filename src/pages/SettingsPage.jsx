import { useData } from '../context/DataContext';

export default function SettingsPage() {
  const { settings } = useData();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Settings</h1>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-gray-600 mb-2">Settings coming in Phase 2...</p>
        <div className="text-sm text-gray-500">
          <p>Net percentage: {settings.netPercentage}%</p>
          <p>Employees: {settings.employees.join(', ') || 'None'}</p>
        </div>
      </div>
    </div>
  );
}
