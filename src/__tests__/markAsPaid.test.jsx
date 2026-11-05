import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PaymentDialog from '../components/PaymentDialog';
import PayrollPage from '../pages/PayrollPage';
import { useData } from '../context/DataContext';

vi.mock('../context/DataContext', () => ({ useData: vi.fn() }));

/**
 * #370: expected amounts are worked out by hand from UAT dry-run 2:
 * Fri 10-16 nets $139.75 and Sat 10-17 nets $178.75, so paying 10-16 alone is $139.75.
 * @requirements REQ-041
 */
const FRI = '2026-10-16';
const SAT = '2026-10-17';
const money = (n) => `$${n.toFixed(2)}`;
const twoNights = () => ({
  nights: 2,
  amount: 318.5,
  dates: [FRI, SAT],
  nightCents: { [FRI]: 13975, [SAT]: 17875 },
});

const dialog = (props = {}) => (
  <PaymentDialog
    isOpen
    employee="Kate"
    outstandingData={twoNights()}
    onConfirm={vi.fn().mockResolvedValue(undefined)}
    onCancel={vi.fn()}
    formatCurrency={money}
    {...props}
  />
);

const untick = (index) => fireEvent.click(screen.getAllByRole('checkbox')[index]);

describe('REQ-041: Mark as Paid (#370)', () => {
  describe('a payment is the sum of the ticked nights', () => {
    it('each night shows its own amount', () => {
      render(dialog());
      expect(screen.getByText('$139.75')).toBeInTheDocument();
      expect(screen.getByText('$178.75')).toBeInTheDocument();
    });

    it('paying Friday alone pays Friday’s amount, not an average', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      render(dialog({ onConfirm }));
      untick(1);
      fireEvent.click(screen.getByText('Confirm Payment'));
      await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
      expect(onConfirm).toHaveBeenCalledWith([FRI], 139.75, { [FRI]: 139.75 });
    });

    it('paying both nights pays exactly the total owed', async () => {
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      render(dialog({ onConfirm }));
      fireEvent.click(screen.getByText('Confirm Payment'));
      await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
      expect(onConfirm.mock.calls[0][1]).toBe(318.5);
    });
  });

  describe('one click, one payment', () => {
    it('a second click during the save does nothing', async () => {
      let finish;
      const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
      render(dialog({ onConfirm }));
      const confirm = screen.getByText('Confirm Payment');
      fireEvent.click(confirm);
      fireEvent.click(confirm);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      await act(async () => finish());
    });

    it('Confirm is disabled and the backdrop does nothing during the save', async () => {
      let finish;
      const onCancel = vi.fn();
      const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
      const { container } = render(dialog({ onConfirm, onCancel }));
      fireEvent.click(screen.getByText('Confirm Payment'));
      expect(screen.getByText('Saving…').closest('button')).toBeDisabled();
      fireEvent.click(container.querySelector('.backdrop-blur-sm'));
      expect(onCancel).not.toHaveBeenCalled();
      await act(async () => finish());
      expect(screen.getByText('Confirm Payment').closest('button')).not.toBeDisabled();
    });

    it('Cancel is disabled during the save', async () => {
      let finish;
      const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
      render(dialog({ onConfirm }));
      fireEvent.click(screen.getByText('Confirm Payment'));
      expect(screen.getByText('Cancel')).toBeDisabled();
      await act(async () => finish());
    });
  });

  describe('a failed save never looks saved', () => {
    it('the box stays open and shows the error', async () => {
      const onConfirm = vi.fn().mockRejectedValue(new Error('One of these nights has already been paid.'));
      render(dialog({ onConfirm }));
      fireEvent.click(screen.getByText('Confirm Payment'));
      expect(await screen.findByText('One of these nights has already been paid.')).toBeInTheDocument();
      expect(screen.getByText('Pay Kate')).toBeInTheDocument();
    });

    it('a night paid elsewhere while the box is open drops out of the ticks and the amount', () => {
      const { rerender } = render(dialog());
      expect(screen.getByText('$318.50')).toBeInTheDocument();
      rerender(dialog({ outstandingData: { nights: 1, amount: 139.75, dates: [FRI], nightCents: { [FRI]: 13975 } } }));
      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      expect(screen.getByText('1 of 1')).toBeInTheDocument();
      expect(screen.getAllByText('$139.75')).toHaveLength(2); // the row and the payment amount
    });

    it('a re-render with fresh data doesn’t re-tick a night left out', () => {
      const { rerender } = render(dialog());
      untick(1);
      rerender(dialog());
      expect(screen.getAllByRole('checkbox').map((box) => box.checked)).toEqual([true, false]);
    });

    it('the page keeps the box open when the save fails', async () => {
      const today = new Date();
      const iso = (daysBack) => {
        const d = new Date(today);
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10);
      };
      const addPayment = vi.fn().mockRejectedValue(new Error('save failed'));
      useData.mockReturnValue({
        dogs: [{ id: '1', name: 'Luna', nightRate: 100, dayRate: 0, active: true }],
        boardings: [{
          id: 'b1',
          dogId: '1',
          arrivalDateTime: `${iso(5)}T14:00:00Z`,
          departureDateTime: `${iso(4)}T10:00:00Z`,
        }],
        payments: [],
        nightAssignments: [],
        getNetPercentageForDate: () => 65,
        getNightAssignment: (date) => (date === iso(5) ? 'Kate' : ''),
        addPayment,
        deletePayment: vi.fn(),
      });
      render(<PayrollPage />);
      fireEvent.click(screen.getByText('Mark as Paid'));
      fireEvent.click(screen.getByText('Confirm Payment'));
      await waitFor(() => expect(addPayment).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('save failed')).toBeInTheDocument();
      expect(screen.getByText('Pay Kate')).toBeInTheDocument();
    });
  });

  describe('the page', () => {
    // Nights inside the page's default range (the last 30 SF days), so the test doesn't age.
    const iso = (daysBack) => {
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      return d.toISOString().slice(0, 10);
    };
    const night = iso(5);
    const pageData = (over = {}) => ({
      dogs: [{ id: '1', name: 'Luna', nightRate: 100, dayRate: 0, active: true }],
      boardings: [{ id: 'b1', dogId: '1', arrivalDateTime: `${iso(5)}T14:00:00Z`, departureDateTime: `${iso(4)}T10:00:00Z` }],
      payments: [],
      nightAssignments: [],
      getNetPercentageForDate: () => 65,
      getNightAssignment: (date) => (date === night ? 'Nick' : ''),
      addPayment: vi.fn().mockResolvedValue(undefined),
      deletePayment: vi.fn().mockResolvedValue(undefined),
      ...over,
    });
    const paidToKate = { id: 'p1', employeeName: 'Kate', amount: 65, nights: 1, dates: [night], paidDate: iso(1) };

    it('a night assigned to Nick but paid to Kate is off Nick’s list, with a line saying so (Q1)', () => {
      useData.mockReturnValue(pageData({ payments: [paidToKate] }));
      render(<PayrollPage />);
      expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
      const line = screen.getByRole('list', { name: "Nights that can't be paid here" });
      expect(line.textContent).toContain('is assigned to Nick but was paid to Kate');
      // Starts with the night as a short date, e.g. "Oct 31 is assigned…"
      expect(line.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2} is assigned/);
      expect(line.textContent).toContain('Delete Kate’s payment to change it.');
    });

    it('a night with a dog that has no rate is not payable as $0; a line says why', () => {
      // useDogs reads a blank rate as parseFloat(null) = NaN
      useData.mockReturnValue(pageData({
        dogs: [{ id: '1', name: 'Luna', nightRate: NaN, dayRate: 0, active: true }],
      }));
      render(<PayrollPage />);
      expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
      const line = screen.getByRole('list', { name: "Nights that can't be paid here" });
      expect(line.textContent).toMatch(/^[A-Z][a-z]{2} \d{1,2} \(Nick\) can't be paid yet: a dog boarded that night has no rate\./);
    });

    it('a night paid to a removed employee says so', () => {
      useData.mockReturnValue(pageData({ payments: [{ ...paidToKate, employeeName: '' }] }));
      render(<PayrollPage />);
      const line = screen.getByRole('list', { name: "Nights that can't be paid here" });
      expect(line.textContent).toContain('is assigned to Nick but was paid to a removed employee. Delete that payment to change it.');
    });

    it('a night paid to the person it is assigned to shows no line', () => {
      useData.mockReturnValue(pageData({ payments: [{ ...paidToKate, employeeName: 'Nick' }] }));
      render(<PayrollPage />);
      expect(screen.queryByRole('list', { name: "Nights that can't be paid here" })).not.toBeInTheDocument();
      expect(screen.queryByText('Mark as Paid')).not.toBeInTheDocument();
    });

    it('the night is paid at 65% of $100: $65.00, sent with its own amount', async () => {
      const data = pageData();
      useData.mockReturnValue(data);
      render(<PayrollPage />);
      fireEvent.click(screen.getByText('Mark as Paid'));
      fireEvent.click(screen.getByText('Confirm Payment'));
      await waitFor(() => expect(data.addPayment).toHaveBeenCalledTimes(1));
      expect(data.addPayment).toHaveBeenCalledWith(expect.objectContaining({
        employeeName: 'Nick', amount: 65, nights: 1, dates: [night], nightAmounts: { [night]: 65 },
        startDate: night, endDate: night,
      }));
      await waitFor(() => expect(screen.queryByText('Pay Nick')).not.toBeInTheDocument());
    });

    it('a refused save whose refresh leaves nothing to pay closes the box and shows the error on the page', async () => {
      let data = pageData();
      data.addPayment = vi.fn(async () => {
        // The refresh brought in another tab's payment for the same night.
        data = pageData({ payments: [{ ...paidToKate, employeeName: 'Nick' }], addPayment: data.addPayment });
        useData.mockReturnValue(data);
        throw new Error('One of these nights has already been paid. The list has been refreshed.');
      });
      useData.mockReturnValue(data);
      const { rerender } = render(<PayrollPage />);
      fireEvent.click(screen.getByText('Mark as Paid'));
      fireEvent.click(screen.getByText('Confirm Payment'));
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe('One of these nights has already been paid. The list has been refreshed.');
      expect(screen.queryByText('Pay Nick')).not.toBeInTheDocument();

      // Later data giving Nick a night to pay again must not pop the closed box back open.
      useData.mockReturnValue(pageData());
      rerender(<PayrollPage />);
      expect(await screen.findByText('Mark as Paid')).toBeInTheDocument();
      expect(screen.queryByText('Pay Nick')).not.toBeInTheDocument();
    });

    it('a failed delete shows an error instead of closing quietly', async () => {
      const deletePayment = vi.fn().mockRejectedValue(new Error('network down'));
      useData.mockReturnValue(pageData({ payments: [paidToKate], deletePayment }));
      render(<PayrollPage />);
      fireEvent.click(screen.getAllByText(/^Delete( Payment)?$/)[0]);
      expect(screen.getByText('Delete Payment Record')).toBeInTheDocument();
      // The confirm box renders last, so its Delete is the last one on the page.
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1));
      await waitFor(() => expect(deletePayment).toHaveBeenCalledWith('p1'));
      expect((await screen.findByRole('alert')).textContent).toBe('The payment was not deleted: network down');
      expect(screen.queryByText('Delete Payment Record')).not.toBeInTheDocument();
    });
  });

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
});
