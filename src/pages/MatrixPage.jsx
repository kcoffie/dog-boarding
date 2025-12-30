import { useData } from '../context/DataContext';

export default function MatrixPage() {
  const { dogs, boardings, settings } = useData();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Boarding Matrix</h1>
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <p className="text-gray-600 mb-2">Matrix view coming in Phase 5...</p>
        <div className="text-sm text-gray-500">
          <p>Dogs in system: {dogs.length}</p>
          <p>Boardings in system: {boardings.length}</p>
          <p>Net percentage: {settings.netPercentage}%</p>
          <p>Employees: {settings.employees.length}</p>
        </div>
      </div>
    </div>
  );
}
