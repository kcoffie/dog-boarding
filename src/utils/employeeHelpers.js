/**
 * Get employee name by ID from an employees array
 * @param {Array} employees - Array of employee objects with id and name
 * @param {string} employeeId - The employee ID to look up
 * @returns {string} The employee name or empty string if not found
 */
export function getEmployeeNameById(employees, employeeId) {
  if (!employeeId) return '';
  const employee = employees.find(e => e.id === employeeId);
  return employee?.name || '';
}

/**
 * Get employee ID by name from an employees array
 * @param {Array} employees - Array of employee objects with id and name
 * @param {string} employeeName - The employee name to look up
 * @returns {string|null} The employee ID or null if not found
 */
export function getEmployeeIdByName(employees, employeeName) {
  if (!employeeName || employeeName === 'N/A') return null;
  const employee = employees.find(e => e.name === employeeName);
  return employee?.id || null;
}

/**
 * Get employee name from a legacy employee format (string or object)
 * Used for backwards compatibility with old employee data format
 * @param {string|Object} employee - Either a string name or an object with name property
 * @returns {string} The employee name
 */
export function getEmployeeName(employee) {
  return typeof employee === 'string' ? employee : employee.name;
}

/**
 * Check if an employee is active
 * @param {string|Object} employee - Either a string name or an object with active property
 * @returns {boolean} Whether the employee is active
 */
export function isEmployeeActive(employee) {
  return typeof employee === 'string' || employee.active !== false;
}
