/* global process */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// "Today" is San Francisco's date, whatever the device's timezone (#350).
// Every clock below is 9pm Pacific on Mon 2026-10-26 unless it says otherwise:
// already Tue 10-27 in UTC (04:00), Paris (05:00) and Tokyo (13:00).
const NINE_PM_PACIFIC = new Date('2026-10-27T04:00:00Z');
const DEVICE_ZONES = ['UTC', 'Europe/Paris', 'Asia/Tokyo', 'America/Los_Angeles'];

const mockUser = { id: 'user-123' };
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('../context/DataContext', () => ({ useData: vi.fn() }));
vi.mock('../hooks/useBoardingForms', () => ({
  useBoardingForms: vi.fn(() => ({ formsByBoardingId: {} })),
  isBoardingUpcoming: vi.fn(() => false),
}));
vi.mock('../components/EmployeeDropdown', () => ({ default: () => null }));
vi.mock('../components/BoardingFormModal', () => ({ default: () => null }));
vi.mock('../hooks/useInvites', () => ({ useInvites: () => ({ invites: [], loading: false }) }));
vi.mock('../hooks/useCronHealth', () => ({ useCronHealth: () => ({ cronHealth: [], loading: false }) }));
vi.mock('../components/SiteAccessCard', () => ({ default: () => null }));
vi.mock('../hooks/useSyncSettings', () => ({
  useSyncSettings: () => ({
    settings: {}, syncLogs: [], loading: false, syncing: false, syncProgress: null, error: null,
    triggerSync: vi.fn(), refresh: vi.fn(), SyncStatus: {},
  }),
}));

const inserted = { row: null };
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
      insert: vi.fn((rows) => {
        inserted.row = rows[0];
        return {
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: { id: 'p1', ...rows[0], employee_id: 'emp-1' }, error: null })),
          })),
        };
      }),
    })),
  },
}));

import { businessToday, businessTodayDate, toDateStr, daysBetween, getDateRange } from '../utils/dateUtils';
import { useData } from '../context/DataContext';
import { usePayments } from '../hooks/usePayments';
import SummaryCards from '../components/SummaryCards';
import BoardingMatrix from '../components/BoardingMatrix';
import DateNavigator from '../components/DateNavigator';
import MatrixPage from '../pages/MatrixPage';
import PayrollPage from '../pages/PayrollPage';
import CalendarPage from '../pages/CalendarPage';
import SettingsPage from '../pages/SettingsPage';
import SyncSettings from '../components/SyncSettings';

const originalTZ = process.env.TZ;
// Node re-reads TZ on assignment, so this sets the "device" timezone for the next Date call
const onDevice = (zone) => { process.env.TZ = zone; };
// Fake only Date, so promises and waitFor still run
const atClock = (instant) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(instant);
};

// The suite's setup mocks localStorage with vi.fn(): read what a page saved from its setItem calls
const saved = (key) => localStorage.setItem.mock.calls.filter(([k]) => k === key).at(-1)?.[1];

beforeEach(() => {
  localStorage.setItem.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TZ = originalTZ;
});

/**
 * @requirements REQ-064
 */
describe('REQ-064: businessToday is the date in San Francisco', () => {
  it.each(DEVICE_ZONES)('at 9pm Pacific it is still Monday 10-26 (device in %s)', (zone) => {
    onDevice(zone);
    expect(businessToday(NINE_PM_PACIFIC)).toBe('2026-10-26');
  });

  it('at 12:30am Pacific (PDT) it is the new day', () => {
    onDevice('UTC');
    expect(businessToday(new Date('2026-10-27T07:30:00Z'))).toBe('2026-10-27');
  });

  it('after DST ends, 11:30pm Pacific (PST) is still Sunday 11-01', () => {
    onDevice('Europe/Paris');
    expect(businessToday(new Date('2026-11-02T07:30:00Z'))).toBe('2026-11-01');
  });

  it('defaults to the current clock', () => {
    onDevice('Asia/Tokyo');
    atClock(NINE_PM_PACIFIC);
    expect(businessToday()).toBe('2026-10-26');
  });
});

/**
 * @requirements REQ-064
 */
describe('REQ-064: calendar dates never go through UTC', () => {
  it.each(DEVICE_ZONES)('businessTodayDate is local midnight of the San Francisco date (device in %s)', (zone) => {
    onDevice(zone);
    const d = businessTodayDate(NINE_PM_PACIFIC);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 10, 26, 0, 0]);
  });

  it('toDateStr keeps the calendar day east of UTC (Paris midnight is still the day before in UTC)', () => {
    onDevice('Europe/Paris');
    expect(toDateStr(new Date(2026, 9, 26))).toBe('2026-10-26');
  });

  it('toDateStr pads month and day to two digits', () => {
    onDevice('UTC');
    expect(toDateStr(new Date(2027, 0, 5))).toBe('2027-01-05');
  });

  it('getDateRange lists the calendar days from the start (device in Paris)', () => {
    onDevice('Europe/Paris');
    expect(getDateRange('2026-10-26', 3)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });

  it('daysBetween counts calendar days across the spring DST change (a 23-hour day)', () => {
    onDevice('America/Los_Angeles');
    expect(daysBetween(new Date(2027, 2, 13), new Date(2027, 2, 15))).toBe(2);
  });

  it('daysBetween counts calendar days across the fall DST change (a 25-hour day)', () => {
    onDevice('America/Los_Angeles');
    expect(daysBetween(new Date(2026, 9, 31), new Date(2026, 10, 2))).toBe(2);
  });

  it('daysBetween is negative when the end is before the start', () => {
    onDevice('UTC');
    expect(daysBetween(new Date(2026, 9, 26), new Date(2026, 9, 23))).toBe(-3);
  });
});

/**
 * @requirements REQ-064
 */
describe('REQ-064: screens use San Francisco today', () => {
  const dogs = [
    { id: 'd1', name: 'Pip', nightRate: 50, active: true },
    { id: 'd2', name: 'Rex', nightRate: 60, active: true },
  ];
  // Pip stays the nights of 10-26 and 10-27; Rex only from 10-27
  const boardings = [
    { id: 'b1', dogId: 'd1', arrivalDateTime: '2026-10-26T10:00:00', departureDateTime: '2026-10-28T10:00:00' },
    { id: 'b2', dogId: 'd2', arrivalDateTime: '2026-10-27T10:00:00', departureDateTime: '2026-10-29T10:00:00' },
  ];

  beforeEach(() => {
    useData.mockReturnValue({
      dogs,
      boardings,
      payments: [],
      nightAssignments: [],
      settings: { netPercentage: 65, netPercentageHistory: [], employees: [] },
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
      addPayment: vi.fn(),
      deletePayment: vi.fn(),
      getPaidDatesForEmployee: () => [],
    });
  });

  it('Dogs Tonight at 9pm Pacific counts tonight (1 dog), not tomorrow (2), on a Paris device', () => {
    onDevice('Europe/Paris');
    atClock(NINE_PM_PACIFIC);
    render(<SummaryCards startDate="2026-10-26" days={3} />);
    expect(screen.getByText('Dogs Tonight').nextElementSibling.textContent).toBe('1');
  });

  // The phone view's date cards: the selected one is indigo
  const mobileCard = (label) => screen.getAllByText(label).map((el) => el.closest('button')).find(Boolean);

  it('the phone view opens on today (Oct 26) at 9pm Pacific, on a UTC device', () => {
    onDevice('UTC');
    atClock(NINE_PM_PACIFIC);
    render(<BrowserRouter><BoardingMatrix startDate="2026-10-25" days={4} /></BrowserRouter>);
    expect(mobileCard('Oct 26').className).toContain('bg-indigo-600');
    expect(mobileCard('Oct 27').className).not.toContain('bg-indigo-600');
  });

  it('the "today" highlight is on Oct 26 at 9pm Pacific, on a UTC device', () => {
    onDevice('UTC');
    atClock(NINE_PM_PACIFIC);
    render(<BrowserRouter><BoardingMatrix startDate="2026-10-25" days={4} /></BrowserRouter>);
    fireEvent.click(mobileCard('Oct 25'));
    expect(mobileCard('Oct 26').querySelector('.text-indigo-600')).not.toBeNull();
    expect(mobileCard('Oct 27').querySelector('.text-indigo-600')).toBeNull();
  });

  it('the Dashboard opens on 14 days from San Francisco today, on a Tokyo device', () => {
    onDevice('Asia/Tokyo');
    atClock(NINE_PM_PACIFIC);
    render(<BrowserRouter><MatrixPage /></BrowserRouter>);
    expect(saved('dashboard-start-date')).toBe('2026-10-26');
    expect(saved('dashboard-end-date')).toBe('2026-11-08');
  });

  it('Payroll opens on the last 30 days ending San Francisco today, on a Paris device', () => {
    onDevice('Europe/Paris');
    atClock(NINE_PM_PACIFIC);
    render(<BrowserRouter><PayrollPage /></BrowserRouter>);
    expect(saved('payroll-start-date')).toBe('2026-09-27');
    expect(saved('payroll-end-date')).toBe('2026-10-26');
  });

  it('the Today button moves the range to San Francisco today, keeping its length, on a Paris device', () => {
    onDevice('Europe/Paris');
    atClock(NINE_PM_PACIFIC);
    const onStartDateChange = vi.fn();
    const onEndDateChange = vi.fn();
    render(
      <DateNavigator
        startDate={new Date(2026, 9, 1)}
        endDate={new Date(2026, 9, 7)}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
      />,
    );
    fireEvent.click(screen.getByText('Today'));
    expect(toDateStr(onStartDateChange.mock.calls[0][0])).toBe('2026-10-26');
    expect(toDateStr(onEndDateChange.mock.calls[0][0])).toBe('2026-11-01');
  });
});

/**
 * @requirements REQ-064
 */
describe('REQ-064: Calendar and Settings use San Francisco today', () => {
  // 9pm Pacific on Sat 10-31: already Sun 11-01 in UTC
  const NINE_PM_PACIFIC_OCT_31 = new Date('2026-11-01T04:00:00Z');

  beforeEach(() => {
    useData.mockReturnValue({
      dogs: [],
      boardings: [],
      nightAssignments: [],
      settings: { netPercentage: 65, netPercentageHistory: [], employees: [] },
      settingsLoading: false,
      getNetPercentageForDate: () => 65,
      sortEmployees: (e) => e,
    });
  });

  const renderCalendar = () => render(<BrowserRouter><CalendarPage /></BrowserRouter>);

  it('the Calendar opens on October at 9pm Pacific on 10-31, on a UTC device', () => {
    onDevice('UTC');
    atClock(NINE_PM_PACIFIC_OCT_31);
    renderCalendar();
    expect(screen.getByText('October 2026')).toBeInTheDocument();
  });

  it('the Calendar marks the 31st as today at 9pm Pacific on 10-31, on a UTC device', () => {
    onDevice('UTC');
    atClock(NINE_PM_PACIFIC_OCT_31);
    const { container } = renderCalendar();
    const marked = [...container.querySelectorAll('span.rounded-full.bg-indigo-600')].map((el) => el.textContent);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((day) => day === '31')).toBe(true);
  });

  it("the Calendar's Today button returns to October at 9pm Pacific on 10-31, on a UTC device", () => {
    onDevice('UTC');
    atClock(NINE_PM_PACIFIC_OCT_31);
    renderCalendar();
    fireEvent.click(screen.getAllByText('Today')[0]);
    expect(screen.getByText('October 2026')).toBeInTheDocument();
  });

  it('Print defaults to San Francisco today through a week later, on a Tokyo device', () => {
    onDevice('Asia/Tokyo');
    atClock(NINE_PM_PACIFIC);
    const { container } = renderCalendar();
    fireEvent.click(screen.getByText('Print'));
    const [from, to] = [...container.ownerDocument.querySelectorAll('input[type="date"]')].map((el) => el.value);
    expect([from, to]).toEqual(['2026-10-26', '2026-11-02']);
  });

  it("the net percentage's effective date defaults to San Francisco today, on a Paris device", () => {
    onDevice('Europe/Paris');
    atClock(NINE_PM_PACIFIC);
    render(<BrowserRouter><SettingsPage /></BrowserRouter>);
    fireEvent.click(screen.getByText('Apply from specific date (preserve past rates)'));
    expect(screen.getByText('Effective from:').nextElementSibling.value).toBe('2026-10-26');
  });

  it('a manual sync defaults to San Francisco today through 60 days later, on a Paris device', () => {
    onDevice('Europe/Paris');
    atClock(NINE_PM_PACIFIC);
    const { container } = render(<SyncSettings />);
    const [from, to] = [...container.querySelectorAll('input[type="date"]')].map((el) => el.value);
    expect([from, to]).toEqual(['2026-10-26', '2026-12-25']);
  });
});

/**
 * @requirements REQ-064
 */
describe('REQ-064: a payment is dated in San Francisco', () => {
  // Stable across renders: a new array each render would refetch forever
  const employees = [{ id: 'emp-1', name: 'Sam', active: true }];

  it('a payment recorded at 9pm Pacific from Paris is dated 10-26', async () => {
    onDevice('Europe/Paris');
    atClock(NINE_PM_PACIFIC);
    const { result } = renderHook(() => usePayments(employees));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.addPayment({
        employeeName: 'Sam', startDate: '2026-10-20', endDate: '2026-10-25', amount: 100, nights: 2, dates: ['2026-10-20', '2026-10-21'],
      });
    });
    expect(inserted.row.paid_date).toBe('2026-10-26');
  });
});
