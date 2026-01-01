/**
 * @requirements REQ-062
 * Employee helper utilities
 */
import { describe, it, expect } from 'vitest';
import {
  getEmployeeNameById,
  getEmployeeIdByName,
  getEmployeeName,
  isEmployeeActive,
} from './employeeHelpers';

/**
 * @requirements REQ-062
 */
describe('REQ-062: getEmployeeNameById', () => {
  const employees = [
    { id: '1', name: 'Kate' },
    { id: '2', name: 'Nick' },
    { id: '3', name: 'Sam' },
  ];

  it('returns employee name when ID is found', () => {
    expect(getEmployeeNameById(employees, '1')).toBe('Kate');
    expect(getEmployeeNameById(employees, '2')).toBe('Nick');
  });

  it('returns empty string for null ID', () => {
    expect(getEmployeeNameById(employees, null)).toBe('');
  });

  it('returns empty string for undefined ID', () => {
    expect(getEmployeeNameById(employees, undefined)).toBe('');
  });

  it('returns empty string for non-existent ID', () => {
    expect(getEmployeeNameById(employees, '999')).toBe('');
  });

  it('returns empty string for empty employees array', () => {
    expect(getEmployeeNameById([], '1')).toBe('');
  });
});

describe('getEmployeeIdByName', () => {
  const employees = [
    { id: '1', name: 'Kate' },
    { id: '2', name: 'Nick' },
    { id: '3', name: 'Sam' },
  ];

  it('returns employee ID when name is found', () => {
    expect(getEmployeeIdByName(employees, 'Kate')).toBe('1');
    expect(getEmployeeIdByName(employees, 'Nick')).toBe('2');
  });

  it('returns null for null name', () => {
    expect(getEmployeeIdByName(employees, null)).toBeNull();
  });

  it('returns null for undefined name', () => {
    expect(getEmployeeIdByName(employees, undefined)).toBeNull();
  });

  it('returns null for N/A', () => {
    expect(getEmployeeIdByName(employees, 'N/A')).toBeNull();
  });

  it('returns null for non-existent name', () => {
    expect(getEmployeeIdByName(employees, 'Unknown')).toBeNull();
  });

  it('returns null for empty employees array', () => {
    expect(getEmployeeIdByName([], 'Kate')).toBeNull();
  });
});

describe('getEmployeeName', () => {
  it('returns string directly when employee is a string', () => {
    expect(getEmployeeName('Kate')).toBe('Kate');
    expect(getEmployeeName('Nick')).toBe('Nick');
  });

  it('returns name property when employee is an object', () => {
    expect(getEmployeeName({ name: 'Kate' })).toBe('Kate');
    expect(getEmployeeName({ name: 'Nick', active: true })).toBe('Nick');
  });
});

describe('isEmployeeActive', () => {
  it('returns true for string employee (legacy format)', () => {
    expect(isEmployeeActive('Kate')).toBe(true);
    expect(isEmployeeActive('Nick')).toBe(true);
  });

  it('returns true for object employee without active property', () => {
    expect(isEmployeeActive({ name: 'Kate' })).toBe(true);
  });

  it('returns true for object employee with active: true', () => {
    expect(isEmployeeActive({ name: 'Kate', active: true })).toBe(true);
  });

  it('returns false for object employee with active: false', () => {
    expect(isEmployeeActive({ name: 'Kate', active: false })).toBe(false);
  });
});
