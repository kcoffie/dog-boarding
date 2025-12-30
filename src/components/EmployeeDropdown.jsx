import { useData } from '../context/DataContext';

export default function EmployeeDropdown({ date }) {
  const { settings, getNightAssignment, setNightAssignment } = useData();

  const selectedEmployee = getNightAssignment(date);

  // Helper to get employee name and active status
  const getEmployeeName = (emp) => typeof emp === 'string' ? emp : emp.name;
  const isEmployeeActive = (emp) => typeof emp === 'string' ? true : emp.active !== false;

  const handleChange = (e) => {
    setNightAssignment(date, e.target.value);
  };

  // Filter to only active employees, but include currently selected even if inactive
  const availableEmployees = settings.employees.filter(emp =>
    isEmployeeActive(emp) || getEmployeeName(emp) === selectedEmployee
  );

  return (
    <select
      value={selectedEmployee}
      onChange={handleChange}
      className="w-full text-xs px-1 py-1 border border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">-</option>
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
