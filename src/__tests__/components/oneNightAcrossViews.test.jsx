import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import BoardingMatrix from '../../components/BoardingMatrix';
import EmployeeTotals from '../../components/EmployeeTotals';
import SummaryCards from '../../components/SummaryCards';
import PayrollPage from '../../pages/PayrollPage';
import CalendarPage from '../../pages/CalendarPage';
import DogsPage from '../../pages/DogsPage';
import { NIGHT, dogs, boardings } from '../fixtures/oneNight';

vi.mock('../../context/DataContext', () => ({ useData: vi.fn() }));
vi.mock('../../hooks/useBoardingForms', () => ({
  useBoardingForms: vi.fn(() => ({ formsByBoardingId: {} })),
  isBoardingUpcoming: vi.fn(() => false),
}));
vi.mock('../../components/EmployeeDropdown', () => ({ default: () => null }));
vi.mock('../../components/BoardingFormModal', () => ({ default: () => null }));

// The night's expected numbers are worked out by hand in ../fixtures/oneNight.js:
// 3 dogs, gross $140, net at 65% $91.00; daytime credit 65% of $85 = $55.25.

const data = (overrides = {}) => ({
  dogs,
  boardings,
  settings: { netPercentage: 65, netPercentageHistory: [], employees: [{ name: 'Kate', active: true }] },
  getNetPercentageForDate: () => 65,
  getNightAssignment: (date) => (date === NIGHT ? 'Kate' : ''),
  getWorkedFollowingDay: () => null,
  nightAssignments: [{ id: 'n1', date: NIGHT, employeeId: 'emp-1', workedFollowingDay: null }],
  payments: [],
  addPayment: vi.fn(),
  deletePayment: vi.fn(),
  getPaidDatesForEmployee: () => [],
  queryDaytimePetNames: vi.fn().mockResolvedValue({}),
  ...overrides,
});

// The value cell right after a label such as "Overnight:" or "Dogs tonight:"
const valueAfter = (label) => screen.getByText(label).nextElementSibling.textContent;
// A calendar day's cell (the day number also appears elsewhere on the page)
const dayCell = (day) => screen.getAllByText(day).find(el => el.closest('.cursor-pointer'));
// A footer row's cell for the one date shown
const footerCell = (match) =>
  screen.getAllByRole('row').find(r => match(r.firstElementChild?.textContent ?? '')).lastElementChild.textContent;

/**
 * @requirements REQ-036
 */
describe('REQ-036: every view shows the same night (3 dogs, $140, $91)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-23T19:00:00Z'));
    localStorage.setItem('payroll-start-date', NIGHT);
    localStorage.setItem('payroll-end-date', NIGHT);
    useData.mockReturnValue(data());
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('Dashboard footer: 3 dogs overnight, $140 gross, $91 net', () => {
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={1} /></BrowserRouter>);
    expect(footerCell(t => t === 'Dogs Overnight')).toBe('3');
    expect(footerCell(t => t === 'Gross')).toBe('$140');
    expect(footerCell(t => t.startsWith('Net'))).toBe('$91');
  });

  it('phone date card: 3 overnight, $140 gross, $91 net, and a list of the same 3', () => {
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={1} /></BrowserRouter>);
    expect(valueAfter('Overnight:')).toBe('3');
    expect(valueAfter('Gross:')).toBe('$140');
    expect(valueAfter('Net:')).toBe('$91');
    expect(screen.getByText('Overnight (3)')).toBeInTheDocument();
    expect(screen.getByText('3 dogs')).toBeInTheDocument();
  });

  it("phone list shows each overnight dog at the booking's price", () => {
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={1} /></BrowserRouter>);
    const overnight = screen.getByText('Overnight (3)').parentElement;
    const rates = [...overnight.querySelectorAll('span.text-sm')].map(s => s.textContent);
    expect(rates).toEqual(['$60', '$40', '$40']);
  });

  it("Dashboard rate column shows the booking's price ($40), not the dog's ($60)", () => {
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={1} /></BrowserRouter>);
    const birchRow = screen.getAllByRole('row').find(r => r.textContent.startsWith('BBirch'));
    expect(birchRow.children[2].textContent).toBe('$40');
  });

  it('Dashboard rate column shows a range when a dog has two prices in the period', () => {
    const second = { id: 'b2', dogId: 'b', arrivalDateTime: '2026-10-24T16:00:00Z', departureDateTime: '2026-10-26T10:00:00Z', nightRate: 60 };
    useData.mockReturnValue(data({ boardings: [...boardings, second] }));
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={3} /></BrowserRouter>);
    const birchRow = screen.getAllByRole('row').find(r => r.textContent.startsWith('BBirch'));
    expect(birchRow.children[2].textContent).toBe('$40–60');
  });

  it('Employee Totals: Kate earns $91.00 for the night', () => {
    render(<EmployeeTotals startDate={NIGHT} days={1} />);
    expect(valueAfter('Total earnings')).toBe('$91.00');
  });

  it('Employee Totals: a worked following day adds 65% of the 3 dogs\' day rates ($55.25)', () => {
    useData.mockReturnValue(data({ getWorkedFollowingDay: (date) => date === NIGHT }));
    render(<EmployeeTotals startDate={NIGHT} days={1} />);
    expect(valueAfter('Total earnings')).toBe('$146.25');
  });

  it('Summary cards: 3 dogs tonight and $140 period revenue', () => {
    render(<SummaryCards startDate={NIGHT} days={1} />);
    expect(screen.getByText('Dogs Tonight').nextElementSibling.textContent).toBe('3');
    expect(screen.getByText('Period Revenue').nextElementSibling.textContent).toBe('$140');
  });

  it('Payroll: $91.00 outstanding for the night', () => {
    render(<PayrollPage />);
    expect(screen.getByText('Total Outstanding').nextElementSibling.textContent).toBe('$91.00');
  });

  it("Payroll: a worked following day adds 65% of the 3 dogs' day rates ($55.25)", () => {
    useData.mockReturnValue(data({
      nightAssignments: [{ id: 'n1', date: NIGHT, employeeId: 'emp-1', workedFollowingDay: true }],
    }));
    render(<PayrollPage />);
    expect(screen.getByText('Total Outstanding').nextElementSibling.textContent).toBe('$146.25');
  });

  it('Calendar day panel: 3 dogs tonight, $140 gross, $91.00 net', () => {
    render(<CalendarPage />);
    fireEvent.click(dayCell('23'));
    expect(valueAfter('Dogs tonight:')).toBe('3');
    expect(valueAfter('Gross:')).toBe('$140');
    expect(valueAfter('Net (65%):')).toBe('$91.00');
  });

  it('Calendar leaves a cancelled boarding off the day', () => {
    render(<CalendarPage />);
    fireEvent.click(dayCell('23'));
    expect(screen.queryByText('Dogwood Test')).not.toBeInTheDocument();
  });

  it("Dogs page: a boarding's gross is its nights at the booking's price ($40, not $60)", () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    const birchRow = screen.getAllByRole('row').find(r => r.textContent.includes('Birch Test') && /Current|Upcoming/.test(r.textContent));
    expect(birchRow.lastElementChild.textContent).toBe('$40.00');
  });

  it('Dogs page shows a cancelled boarding as Cancelled at $0.00', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    const dogwoodRow = screen.getAllByRole('row').find(r => r.textContent.includes('Dogwood Test') && r.textContent.includes('Cancelled'));
    expect(dogwoodRow.lastElementChild.textContent).toBe('$0.00');
  });

  it("Dashboard rate column ignores a cancelled boarding's price: $40, not $40–60", () => {
    const cancelled = { id: 'b3', dogId: 'b', arrivalDateTime: '2026-10-22T16:00:00Z', departureDateTime: '2026-10-25T10:00:00Z', nightRate: 60, cancelledAt: '2026-10-20T12:00:00Z' };
    useData.mockReturnValue(data({ boardings: [...boardings, cancelled] }));
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={1} /></BrowserRouter>);
    const birchRow = screen.getAllByRole('row').find(r => r.textContent.startsWith('BBirch'));
    expect(birchRow.children[2].textContent).toBe('$40');
  });

  it("Dashboard rate column ignores a day visit's price: $40, not $40–60", () => {
    const dayVisit = { id: 'b0', dogId: 'b', arrivalDateTime: '2026-10-23T08:00:00Z', departureDateTime: '2026-10-23T12:00:00Z', nightRate: null };
    useData.mockReturnValue(data({ boardings: [...boardings, dayVisit] }));
    render(<BrowserRouter><BoardingMatrix startDate={NIGHT} days={1} /></BrowserRouter>);
    const birchRow = screen.getAllByRole('row').find(r => r.textContent.startsWith('BBirch'));
    expect(birchRow.children[2].textContent).toBe('$40');
  });

  it("Calendar leaves a cancelled boarding out of the day's Arriving, Staying and Departing lists", () => {
    const cancelledArrival = { id: 'd2', dogId: 'd', arrivalDateTime: '2026-10-23T16:00:00Z', departureDateTime: '2026-10-25T10:00:00Z', nightRate: 60, cancelledAt: '2026-10-20T12:00:00Z' };
    useData.mockReturnValue(data({ boardings: [...boardings, cancelledArrival] }));
    render(<CalendarPage />);
    fireEvent.click(dayCell('23'));
    // Birch, Cedar and Elm's day visit arrive on the 23rd; the cancelled Dogwood doesn't
    const arriving = screen.getAllByRole('heading', { level: 4 }).find(h => h.textContent.trim().startsWith('Arriving'));
    expect(arriving.textContent.trim()).toBe('Arriving (3)');
    expect(screen.queryByText('Dogwood Test')).not.toBeInTheDocument();
  });

  it('Dogs page has no Edit or Delete for a boarding (the booking site is the source of truth)', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
