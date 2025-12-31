import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PaymentDialog from './PaymentDialog';

describe('PaymentDialog', () => {
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();
  const mockFormatCurrency = (amount) => `$${amount.toFixed(2)}`;

  const defaultProps = {
    isOpen: true,
    employee: 'Kate',
    outstandingData: {
      nights: 3,
      amount: 90, // $30 per night
      dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
    },
    onConfirm: mockOnConfirm,
    onCancel: mockOnCancel,
    formatCurrency: mockFormatCurrency,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<PaymentDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Pay Kate')).not.toBeInTheDocument();
    });

    it('renders nothing when outstandingData is null', () => {
      render(<PaymentDialog {...defaultProps} outstandingData={null} />);
      expect(screen.queryByText('Pay Kate')).not.toBeInTheDocument();
    });

    it('renders dialog with employee name', () => {
      render(<PaymentDialog {...defaultProps} />);
      expect(screen.getByText('Pay Kate')).toBeInTheDocument();
    });

    it('renders all dates as checkboxes', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(3);
    });

    it('shows dates in sorted order', () => {
      const propsWithUnsortedDates = {
        ...defaultProps,
        outstandingData: {
          nights: 3,
          amount: 90,
          dates: ['2025-01-17', '2025-01-15', '2025-01-16'],
        },
      };
      render(<PaymentDialog {...propsWithUnsortedDates} />);

      const labels = screen.getAllByRole('checkbox').map(cb =>
        cb.closest('label').textContent
      );
      // Should be sorted chronologically
      expect(labels[0]).toContain('Jan 15');
      expect(labels[1]).toContain('Jan 16');
      expect(labels[2]).toContain('Jan 17');
    });

    it('shows Select All and Deselect All buttons', () => {
      render(<PaymentDialog {...defaultProps} />);
      expect(screen.getByText('Select All')).toBeInTheDocument();
      expect(screen.getByText('Deselect All')).toBeInTheDocument();
    });

    it('shows amount per night for each date', () => {
      render(<PaymentDialog {...defaultProps} />);
      // $90 / 3 nights = $30 per night
      const amountTexts = screen.getAllByText('$30.00');
      expect(amountTexts.length).toBeGreaterThanOrEqual(3);
    });

    it('displays employee initial in avatar', () => {
      render(<PaymentDialog {...defaultProps} />);
      expect(screen.getByText('K')).toBeInTheDocument();
    });
  });

  describe('Initial state', () => {
    it('all dates are selected by default', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });

    it('shows full amount when all dates selected', () => {
      render(<PaymentDialog {...defaultProps} />);
      expect(screen.getByText('$90.00')).toBeInTheDocument();
    });

    it('shows correct night count when all selected', () => {
      render(<PaymentDialog {...defaultProps} />);
      expect(screen.getByText('3 of 3')).toBeInTheDocument();
    });
  });

  describe('Date selection', () => {
    it('deselects a date when clicking its checkbox', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');

      fireEvent.click(checkboxes[0]);

      expect(checkboxes[0]).not.toBeChecked();
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).toBeChecked();
    });

    it('updates amount when deselecting a date', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');

      fireEvent.click(checkboxes[0]);

      // 2 nights * $30 = $60
      expect(screen.getByText('$60.00')).toBeInTheDocument();
    });

    it('updates night count when deselecting a date', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');

      fireEvent.click(checkboxes[0]);

      expect(screen.getByText('2 of 3')).toBeInTheDocument();
    });

    it('reselects a date when clicking again', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');

      fireEvent.click(checkboxes[0]); // deselect
      fireEvent.click(checkboxes[0]); // reselect

      expect(checkboxes[0]).toBeChecked();
    });

    it('can select individual dates after deselecting all', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));

      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[1]); // select middle date

      expect(checkboxes[0]).not.toBeChecked();
      expect(checkboxes[1]).toBeChecked();
      expect(checkboxes[2]).not.toBeChecked();
      expect(screen.getByText('1 of 3')).toBeInTheDocument();
    });
  });

  describe('Select All / Deselect All', () => {
    it('Deselect All unchecks all dates', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).not.toBeChecked();
      });
    });

    it('Deselect All sets amount to zero', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));

      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });

    it('Select All checks all dates after deselecting', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));
      fireEvent.click(screen.getByText('Select All'));

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });

    it('Select All restores full amount', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));
      fireEvent.click(screen.getByText('Select All'));

      expect(screen.getByText('$90.00')).toBeInTheDocument();
    });
  });

  describe('Confirm button', () => {
    it('is enabled when dates are selected', () => {
      render(<PaymentDialog {...defaultProps} />);
      const confirmButton = screen.getByText('Confirm Payment');
      expect(confirmButton).not.toBeDisabled();
    });

    it('is disabled when no dates are selected', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));

      const confirmButton = screen.getByText('Confirm Payment');
      expect(confirmButton).toBeDisabled();
    });

    it('calls onConfirm with selected dates and amount', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Confirm Payment'));

      expect(mockOnConfirm).toHaveBeenCalledWith(
        ['2025-01-15', '2025-01-16', '2025-01-17'],
        90
      );
    });

    it('calls onConfirm with partial selection', () => {
      render(<PaymentDialog {...defaultProps} />);
      const checkboxes = screen.getAllByRole('checkbox');

      fireEvent.click(checkboxes[0]); // deselect first
      fireEvent.click(screen.getByText('Confirm Payment'));

      expect(mockOnConfirm).toHaveBeenCalledWith(
        expect.arrayContaining(['2025-01-16', '2025-01-17']),
        60
      );
      expect(mockOnConfirm.mock.calls[0][0]).not.toContain('2025-01-15');
    });

    it('does not call onConfirm when clicking disabled button', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Deselect All'));
      fireEvent.click(screen.getByText('Confirm Payment'));

      expect(mockOnConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Cancel button', () => {
    it('calls onCancel when clicked', () => {
      render(<PaymentDialog {...defaultProps} />);

      fireEvent.click(screen.getByText('Cancel'));

      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('calls onCancel when clicking backdrop', () => {
      render(<PaymentDialog {...defaultProps} />);

      // The backdrop has the onClick handler
      const backdrop = document.querySelector('.fixed.inset-0.bg-slate-900\\/50');
      fireEvent.click(backdrop);

      expect(mockOnCancel).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('handles single date correctly', () => {
      const singleDateProps = {
        ...defaultProps,
        outstandingData: {
          nights: 1,
          amount: 30,
          dates: ['2025-01-15'],
        },
      };
      render(<PaymentDialog {...singleDateProps} />);

      expect(screen.getAllByRole('checkbox')).toHaveLength(1);
      expect(screen.getByText('1 of 1')).toBeInTheDocument();
    });

    it('handles zero amount gracefully', () => {
      const zeroAmountProps = {
        ...defaultProps,
        outstandingData: {
          nights: 2,
          amount: 0,
          dates: ['2025-01-15', '2025-01-16'],
        },
      };
      render(<PaymentDialog {...zeroAmountProps} />);

      // Multiple $0.00 texts exist (per date and total), so use getAllByText
      const zeroAmounts = screen.getAllByText('$0.00');
      expect(zeroAmounts.length).toBeGreaterThan(0);
    });

    it('resets selection when dialog reopens with new employee', () => {
      const { rerender } = render(<PaymentDialog {...defaultProps} />);

      // Deselect some dates
      fireEvent.click(screen.getByText('Deselect All'));

      // Close and reopen with same employee (simulating new open)
      rerender(<PaymentDialog {...defaultProps} isOpen={false} />);
      rerender(<PaymentDialog {...defaultProps} isOpen={true} />);

      // All should be selected again
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked();
      });
    });
  });
});
