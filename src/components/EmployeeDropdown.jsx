import { useData } from '../context/DataContext';

export default function EmployeeDropdown({ date }) {
  const { settings, getNightAssignment, setNightAssignment } = useData();

  const selectedEmployee = getNightAssignment(date);

  const handleChange = (e) => {
    setNightAssignment(date, e.target.value);
  };

  return (
    <select
      value={selectedEmployee}
      onChange={handleChange}
      className="w-full text-xs px-1 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">-</option>
      {settings.employees.map((employee) => (
        <option key={employee} value={employee}>
          {employee}
        </option>
      ))}
    </select>
  );
}
