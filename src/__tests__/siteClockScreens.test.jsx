/**
 * #353 PR 2 (= #350 PR 2): the screens read booking times as the booking site shows them.
 * Booking times are San Francisco clock times written as UTC (ADR-009): the site shows
 * 10:00am and stores 10:00Z. Every expected value is worked out by hand from that rule
 * and Kate's answers (design note Q1–Q6); each test runs with the host in six zones.
 * @requirements REQ-065
 */
import { describe, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useData } from '../context/DataContext';
import DogsPage from '../pages/DogsPage';
import CalendarPage from '../pages/CalendarPage';
import SyncDetailModal from '../components/SyncDetailModal';
import SyncHistoryTable from '../components/SyncHistoryTable';
import BoardingFormModal from '../components/BoardingFormModal';
import { eachZone, restoreHostZone } from './hostZones';

vi.mock('../context/DataContext', () => ({ useData: vi.fn() }));
vi.mock('../hooks/useBoardingForms', () => ({
  useBoardingForms: vi.fn(() => ({ formsByBoardingId: {} })),
  isBoardingUpcoming: vi.fn(() => false),
}));
vi.mock('../components/EmployeeDropdown', () => ({ default: () => null }));

const dog = (id, name) => ({ id, name, nightRate: 50, dayRate: 25, active: true });
const stay = (id, dogId, arrivalDateTime, departureDateTime, arrivalAmPm = null, departureAmPm = null) =>
  ({ id, dogId, arrivalDateTime, departureDateTime, arrivalAmPm, departureAmPm, nightRate: 50, cancelledAt: null });

const data = (dogs, boardings) => ({
  dogs,
  boardings,
  settings: { netPercentage: 65, netPercentageHistory: [], employees: [] },
  getNetPercentageForDate: () => 65,
  nightAssignments: [],
  addDog: vi.fn(),
  toggleDogActive: vi.fn(),
});

const atClock = (instant) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreHostZone();
});

// A boarding table row's cells, found by the dog's name. The dog list also has a row per
// dog, so only rows of a table with an Arrival column count.
const rowCells = (name) =>
  [...screen.getAllByRole('row')
    .find((r) => r.textContent.includes(name) && r.closest('table').querySelector('thead').textContent.includes('Arrival'))
    .querySelectorAll('td')].map((td) => td.textContent);

describe('REQ-065: the Dogs page shows booking times as the site does', () => {
  // 9:30am Pacific on Thu 10-29 (PDT, UTC−7)
  const NOW = '2026-10-29T16:30:00Z';
  const dogs = [dog('d1', 'Aspen Test'), dog('d2', 'Birch Test'), dog('d3', 'Cedar Test'), dog('d4', 'Dune Test'), dog('d5', 'Fir Test')];
  const boardings = [
    // the site's "10:00am Oct 29 → 5:00pm Nov 2" (a stay across DST's end, design note E6)
    stay('b1', 'd1', '2026-10-29T10:00:00Z', '2026-11-02T17:00:00Z', 'AM', 'PM'),
    // picked up at 4:15pm today
    stay('b2', 'd2', '2026-10-27T10:00:00Z', '2026-10-29T16:15:00Z', 'AM', 'PM'),
    // a title-only stay, synced by Vercel (00:00Z) and by a Paris browser (23:00Z), no labels
    stay('b3', 'd3', '2026-03-07T00:00:00Z', '2026-03-08T23:00:00Z'),
    // the site's PM label contradicts a 10:00 time
    stay('b4', 'd4', '2026-02-10T10:00:00Z', '2026-02-12T16:15:00Z', 'PM', 'PM'),
    // a 4pm drop-off, a 9am pick-up
    stay('b5', 'd5', '2026-10-29T16:00:00Z', '2026-11-02T09:00:00Z'),
  ];

  beforeEach(() => {
    atClock(NOW);
    useData.mockReturnValue(data(dogs, boardings));
  });

  eachZone('a booking time shows the site date and time with "PT"', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    const cells = rowCells('Aspen Test');
    expect(cells[2]).toBe('Oct 29, 2026 10:00 AM PT');
    expect(cells[3]).toBe('Nov 2, 2026 5:00 PM PT');
  });

  eachZone('a stay from Oct 29 to Nov 2 is 4 nights, across the end of DST', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    expect(rowCells('Aspen Test')[4]).toBe('4');
  });

  eachZone('a 4pm drop-off to a 9am pick-up four days later is 4 nights', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    expect(rowCells('Fir Test')[4]).toBe('4');
  });

  eachZone('at 9:30am a 10:00am arrival is Upcoming', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    expect(rowCells('Aspen Test')[1]).toBe('Upcoming');
  });

  eachZone('at 9:30am a 4:15pm pick-up today is Current, not Past', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    expect(rowCells('Birch Test')[1]).toBe('Current');
    expect(screen.queryByText(/Historical boarding records/)).toHaveTextContent('(2 total)');
  });

  eachZone('a title-only stay shows its dates with no time (Q2, Q6)', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    const cells = rowCells('Cedar Test');
    expect(cells[1]).toBe('Mar 7, 2026');
    expect(cells[2]).toBe('Mar 8, 2026');
    expect(cells[3]).toBe('1');
  });

  eachZone('an AM/PM label that contradicts the time shows the date only (Q5)', () => {
    render(<BrowserRouter><DogsPage /></BrowserRouter>);
    const cells = rowCells('Dune Test');
    expect(cells[1]).toBe('Feb 10, 2026');
    expect(cells[2]).toBe('Feb 12, 2026 4:15 PM PT');
  });
});

describe('REQ-065: the Calendar places bookings on their site dates', () => {
  // 11am Pacific on Tue 10-27, so the Calendar opens on October 2026
  const NOW = '2026-10-27T18:00:00Z';
  const dogs = [
    dog('d1', 'Aspen Test'), dog('d2', 'Gum Test'), dog('d3', 'Hazel Test'), dog('d4', 'Ivy Test'), dog('d5', 'Juniper Test'),
  ];
  const boardings = [
    stay('b1', 'd1', '2026-10-29T10:00:00Z', '2026-11-02T17:00:00Z', 'AM', 'PM'), // arrives 10-29 10:00am
    stay('b2', 'd2', '2026-10-28T16:00:00Z', '2026-10-29T16:15:00Z', 'PM', 'PM'), // leaves 10-29 4:15pm
    stay('b3', 'd3', '2026-10-27T10:00:00Z', '2026-10-31T11:00:00Z', 'AM', 'AM'), // stays over 10-29
    stay('b4', 'd4', '2026-10-26T10:00:00Z', '2026-10-28T17:00:00Z', 'AM', 'PM'), // left 10-28 5pm
    stay('b5', 'd5', '2026-10-30T10:00:00Z', '2026-11-01T11:00:00Z', 'AM', 'AM'), // arrives 10-30 10am
  ];
  const dayCell = (day) => screen.getAllByText(day).find((el) => el.closest('.cursor-pointer'));
  // The selected day's panel (the month grid shows the same names on their bars)
  const panel = () => within(screen.getByText('Thursday, October 29').closest('.rounded-xl'));
  const card = (name) => panel().getByText(name).parentElement;

  beforeEach(() => {
    atClock(NOW);
    useData.mockReturnValue(data(dogs, boardings));
  });

  eachZone('Oct 29 lists the 10:00am arrival, the stay and the 4:15pm departure, with site times', () => {
    render(<CalendarPage />);
    fireEvent.click(dayCell('29'));
    expect(card('Aspen Test').textContent).toBe('Aspen Test10:00 AM PT → Nov 2');
    expect(card('Hazel Test').textContent).toBe('Hazel TestSince Oct 27 → Oct 31');
    expect(card('Gum Test').textContent).toBe('Gum TestOct 28 → 4:15 PM PT');
  });

  eachZone('Oct 29 lists neither a stay that ended Oct 28 at 5pm nor one starting Oct 30 at 10am', () => {
    render(<CalendarPage />);
    fireEvent.click(dayCell('29'));
    expect(panel().queryByText('Ivy Test')).toBeNull();
    expect(panel().queryByText('Juniper Test')).toBeNull();
  });

  eachZone('the print view for Oct 29 sorts arrivals, stays and departures by site date, with site times', () => {
    vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<CalendarPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    const [from, to] = document.querySelectorAll('input[type="date"]');
    fireEvent.change(from, { target: { value: '2026-10-29' } });
    fireEvent.change(to, { target: { value: '2026-10-29' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate & Print' }));

    const print = within(document.querySelector('#calendar-print-view'));
    const line = (name) => print.getByText(name).nextElementSibling.textContent;
    expect(print.getByText('Thursday, October 29, 2026')).toBeInTheDocument();
    expect(print.getByText('Arriving (1)')).toBeInTheDocument();
    expect(line('Aspen Test')).toBe('10:00 AM PT → Nov 2 5:00 PM PT');
    expect(print.getByText('Staying (1)')).toBeInTheDocument();
    expect(line('Hazel Test')).toBe('Since Oct 27 10:00 AM PT → Oct 31 11:00 AM PT');
    expect(print.getByText('Departing (1)')).toBeInTheDocument();
    expect(line('Gum Test')).toBe('Oct 28 4:00 PM PT → 4:15 PM PT');
    expect(print.queryByText('Ivy Test')).toBeNull();
    expect(print.queryByText('Juniper Test')).toBeNull();
  });
});

describe('REQ-065: Sync History shows booking dates as the site does, and run times in San Francisco time', () => {
  // A Sync Now that started at 5:05pm Pacific on Tue 10-27
  const log = {
    id: 'log-1',
    status: 'success',
    started_at: '2026-10-28T00:05:00Z',
    change_details: [
      { action: 'created', dog_name: 'Aspen Test', check_in: '2026-10-29T10:00:00Z', check_out: '2026-11-02T17:00:00Z' },
      {
        action: 'updated', dog_name: 'Gum Test', check_in: '2026-10-29T16:00:00Z', check_out: '2026-10-31T11:00:00Z',
        changes: { check_in_datetime: { old: '2026-10-29T10:00:00Z', new: '2026-10-29T16:00:00Z' } },
      },
    ],
  };
  const details = { appointments: [{ pet_name: 'Hazel Test', service_type: 'Boarding', check_in_datetime: '2026-10-29T10:00:00Z', check_out_datetime: '2026-11-02T17:00:00Z' }] };

  eachZone('the run started "Oct 27, 2026, 5:05 PM PT"', () => {
    render(<SyncDetailModal isOpen onClose={() => {}} log={log} details={details} loading={false} />);
    expect(screen.getByText('Oct 27, 2026, 5:05 PM PT')).toBeInTheDocument();
  });

  eachZone('a new boarding shows "Oct 29, 2026 → Nov 2, 2026"', () => {
    render(<SyncDetailModal isOpen onClose={() => {}} log={log} details={details} loading={false} />);
    expect(screen.getByText('Aspen Test').parentElement.nextElementSibling.textContent).toBe('Oct 29, 2026 → Nov 2, 2026');
  });

  eachZone('an updated boarding shows "Oct 29 - Oct 31" and its check-in change "Oct 29, 2026 10:00 AM PT → Oct 29, 2026 4:00 PM PT"', () => {
    render(<SyncDetailModal isOpen onClose={() => {}} log={log} details={details} loading={false} />);
    expect(screen.getByText('Gum Test').nextElementSibling.textContent).toBe('Oct 29 - Oct 31');
    expect(screen.getByText('check in datetime:').parentElement.textContent)
      .toBe('check in datetime: Oct 29, 2026 10:00 AM PT→Oct 29, 2026 4:00 PM PT');
  });

  eachZone('a processed appointment shows "Oct 29 - Nov 2"', () => {
    render(<SyncDetailModal isOpen onClose={() => {}} log={log} details={details} loading={false} />);
    expect(screen.getByText('Hazel Test').parentElement.nextElementSibling.textContent).toBe('Oct 29 - Nov 2');
  });

  eachZone('the history list shows the run at "Oct 27, 5:05 PM PT"', () => {
    render(<SyncHistoryTable logs={[log]} loading={false} onSelectLog={() => {}} />);
    expect(screen.getAllByText('Oct 27, 5:05 PM PT').length).toBeGreaterThan(0);
  });
});

describe('REQ-065: the form view shows the booking dates as the site does', () => {
  const formData = {
    date_mismatch: true,
    form_arrival_date: '2026-10-29',
    form_departure_date: '2026-11-01',
    form_data: { priorityFields: [], allFields: [] },
  };
  const boarding = { arrivalDateTime: '2026-10-29T10:00:00Z', departureDateTime: '2026-11-02T17:00:00Z' };

  eachZone('the Date Discrepancy line reads booking "Oct 29, 2026 → Nov 2, 2026", form "Oct 29, 2026 → Nov 1, 2026"', () => {
    render(<BoardingFormModal isOpen onClose={() => {}} dogName="Aspen Test" formData={formData} boarding={boarding} />);
    const alert = screen.getByText('Date Discrepancy').parentElement;
    expect(alert.textContent).toContain('Oct 29, 2026 → Nov 2, 2026');
    expect(alert.textContent).toContain('Oct 29, 2026 → Nov 1, 2026');
  });
});
