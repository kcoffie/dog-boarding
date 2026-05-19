/**
 * Tests for the overnight staff grid in CalendarPage.
 * getStaffForDay is an inline closure inside the component; the logic is
 * replicated here, consistent with the CalendarPrint.test.js pattern.
 * @requirements REQ-701
 */

import { describe, it, expect } from 'vitest';

// Replicated from CalendarPage.jsx
function getEmployeeNameById(employees, employeeId) {
  if (!employeeId) return '';
  const employee = employees.find(e => e.id === employeeId);
  return employee?.name || '';
}

function makeGetStaffForDay({ year, month, nightAssignments, employees }) {
  return function getStaffForDay(day) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const assignment = nightAssignments?.find(x => x.date === dateStr);
    if (!assignment) return null;
    if (assignment.employeeId === null) return { name: 'N/A', isNA: true };
    const name = getEmployeeNameById(employees ?? [], assignment.employeeId) || 'Unknown';
    return { name, isNA: false };
  };
}

const EMPLOYEES = [
  { id: 'e1', name: 'Alice' },
  { id: 'e2', name: 'Bob' },
];

describe('REQ-701: Overnight Staff Calendar Grid', () => {
  it('returns null when no assignment exists for the day', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 4, // May (0-indexed)
      nightAssignments: [],
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(15)).toBeNull();
  });

  it('returns { name: "N/A", isNA: true } when employeeId is null', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 4,
      nightAssignments: [{ date: '2026-05-15', employeeId: null }],
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(15)).toEqual({ name: 'N/A', isNA: true });
  });

  it('returns employee name and isNA: false for a known employee', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 4,
      nightAssignments: [{ date: '2026-05-15', employeeId: 'e1' }],
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(15)).toEqual({ name: 'Alice', isNA: false });
  });

  it('returns "Unknown" when employeeId is not in the employees list', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 4,
      nightAssignments: [{ date: '2026-05-15', employeeId: 'e-missing' }],
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(15)).toEqual({ name: 'Unknown', isNA: false });
  });

  it('matches the correct day within a multi-entry nightAssignments array', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 4,
      nightAssignments: [
        { date: '2026-05-14', employeeId: 'e2' },
        { date: '2026-05-15', employeeId: 'e1' },
        { date: '2026-05-16', employeeId: null },
      ],
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(14)).toEqual({ name: 'Bob', isNA: false });
    expect(getStaffForDay(15)).toEqual({ name: 'Alice', isNA: false });
    expect(getStaffForDay(16)).toEqual({ name: 'N/A', isNA: true });
    expect(getStaffForDay(17)).toBeNull();
  });

  it('pads month and day to two digits when forming the date string', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 0, // January
      nightAssignments: [{ date: '2026-01-05', employeeId: 'e1' }],
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(5)).toEqual({ name: 'Alice', isNA: false });
    expect(getStaffForDay(4)).toBeNull();
  });

  it('returns null gracefully when nightAssignments is undefined', () => {
    const getStaffForDay = makeGetStaffForDay({
      year: 2026, month: 4,
      nightAssignments: undefined,
      employees: EMPLOYEES,
    });
    expect(getStaffForDay(15)).toBeNull();
  });
});
