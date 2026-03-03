/**
 * BoardingMatrix component tests — form link color coding
 * @requirements REQ-507
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BoardingMatrix from '../../components/BoardingMatrix';
import { useData } from '../../context/DataContext';
import { useBoardingForms, isBoardingUpcoming } from '../../hooks/useBoardingForms';

vi.mock('../../context/DataContext', () => ({ useData: vi.fn() }));
vi.mock('../../hooks/useBoardingForms', () => ({
  useBoardingForms: vi.fn(),
  isBoardingUpcoming: vi.fn(),
}));
vi.mock('../../components/EmployeeDropdown', () => ({ default: () => null }));
vi.mock('../../components/BoardingFormModal', () => ({ default: () => null }));

// Build dates that guarantee isOvernight() returns true for today
const pad = (n) => String(n).padStart(2, '0');
const localToday = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();
const yesterday = (() => {
  const d = new Date(Date.now() - 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();
const nextWeek = (() => {
  const d = new Date(Date.now() + 7 * 86400000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

const dog = { id: 'dog-1', name: 'Buddy', nightRate: 50, dayRate: 30 };
const boarding = {
  id: 'boarding-1',
  dogId: 'dog-1',
  arrivalDateTime: `${yesterday}T12:00:00`,
  departureDateTime: `${nextWeek}T12:00:00`,
};

const defaultDataMock = {
  dogs: [dog],
  boardings: [boarding],
  settings: { employees: [], netPercentage: 70 },
  getNetPercentageForDate: () => 70,
  getNightAssignment: () => null,
};

describe('REQ-507: BoardingMatrix — form link color coding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useData.mockReturnValue(defaultDataMock);
    isBoardingUpcoming.mockReturnValue(true);
  });

  it('renders red link when dog has upcoming boarding but no form record', () => {
    useBoardingForms.mockReturnValue({ formsByBoardingId: {} });
    render(<BoardingMatrix startDate={localToday} />);
    // Desktop table renders the dog name as a button; grab the first match
    const buttons = screen.getAllByRole('button', { name: /Buddy/i });
    expect(buttons[0].className).toContain('text-red-600');
  });

  it('renders amber link when form found but zero priorityFields', () => {
    useBoardingForms.mockReturnValue({
      formsByBoardingId: {
        'boarding-1': { form_data: { priorityFields: [], otherFields: [] } },
      },
    });
    render(<BoardingMatrix startDate={localToday} />);
    const buttons = screen.getAllByRole('button', { name: /Buddy/i });
    expect(buttons[0].className).toContain('text-amber-600');
  });

  it('renders indigo link when form found with priorityFields', () => {
    useBoardingForms.mockReturnValue({
      formsByBoardingId: {
        'boarding-1': {
          form_data: {
            priorityFields: [{ fieldId: 'f1', label: 'Vet', value: 'Dr. Smith' }],
            otherFields: [],
          },
        },
      },
    });
    render(<BoardingMatrix startDate={localToday} />);
    const buttons = screen.getAllByRole('button', { name: /Buddy/i });
    expect(buttons[0].className).toContain('text-indigo-700');
  });

  it('renders slate link when dog has no upcoming boarding', () => {
    // isBoardingUpcoming returns false → getRelevantBoarding returns null → slate color
    isBoardingUpcoming.mockReturnValue(false);
    useBoardingForms.mockReturnValue({ formsByBoardingId: {} });
    render(<BoardingMatrix startDate={localToday} />);
    const buttons = screen.getAllByRole('button', { name: /Buddy/i });
    expect(buttons[0].className).toContain('text-slate-900');
  });
});
