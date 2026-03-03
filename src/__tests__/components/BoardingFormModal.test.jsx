/**
 * BoardingFormModal component tests
 * @requirements REQ-506, REQ-508
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BoardingFormModal from '../../components/BoardingFormModal';

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  dogName: 'Buddy',
  boarding: {
    arrivalDateTime: '2026-03-10T12:00:00',
    departureDateTime: '2026-03-14T12:00:00',
  },
};

describe('REQ-508: BoardingFormModal — View on site link + conditional Print', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('"View on site →" link', () => {
    it('renders link when submission_url is present', () => {
      const formData = {
        submission_url: 'https://agirlandyourdog.com/pets/90043/forms/7913/view/42',
        form_data: { priorityFields: [{ fieldId: 'f1', label: 'Vet', value: 'Dr. Smith' }], otherFields: [] },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      expect(screen.getByRole('link', { name: /View on site/i })).toBeInTheDocument();
    });

    it('does not render link when submission_url is null', () => {
      const formData = {
        submission_url: null,
        form_data: { priorityFields: [{ fieldId: 'f1', label: 'Vet', value: 'Dr. Smith' }], otherFields: [] },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      expect(screen.queryByRole('link', { name: /View on site/i })).not.toBeInTheDocument();
    });

    it('does not render link when submission_url is undefined', () => {
      const formData = {
        form_data: { priorityFields: [], otherFields: [] },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      expect(screen.queryByRole('link', { name: /View on site/i })).not.toBeInTheDocument();
    });

    it('does not render link when formData is null', () => {
      render(<BoardingFormModal {...baseProps} formData={null} />);
      expect(screen.queryByRole('link', { name: /View on site/i })).not.toBeInTheDocument();
    });

    it('link has target="_blank" and rel="noopener noreferrer"', () => {
      const formData = {
        submission_url: 'https://agirlandyourdog.com/pets/90043/forms/7913/view/42',
        form_data: { priorityFields: [], otherFields: [] },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      const link = screen.getByRole('link', { name: /View on site/i });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('link has print:hidden class', () => {
      const formData = {
        submission_url: 'https://agirlandyourdog.com/pets/90043/forms/7913/view/42',
        form_data: { priorityFields: [], otherFields: [] },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      const link = screen.getByRole('link', { name: /View on site/i });
      expect(link.className).toContain('print:hidden');
    });
  });

  describe('Print button', () => {
    it('renders Print button when priorityFields has content', () => {
      const formData = {
        form_data: {
          priorityFields: [{ fieldId: 'f1', label: 'Vet', value: 'Dr. Smith' }],
          otherFields: [],
        },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      expect(screen.getByRole('button', { name: /Print/i })).toBeInTheDocument();
    });

    it('renders Print button when otherFields has content', () => {
      const formData = {
        form_data: {
          priorityFields: [],
          otherFields: [{ fieldId: 'f2', label: 'Notes', value: 'Some note' }],
        },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      expect(screen.getByRole('button', { name: /Print/i })).toBeInTheDocument();
    });

    it('does not render Print button when formData is null', () => {
      render(<BoardingFormModal {...baseProps} formData={null} />);
      expect(screen.queryByRole('button', { name: /Print/i })).not.toBeInTheDocument();
    });

    it('does not render Print button when priorityFields and otherFields are both empty', () => {
      const formData = {
        form_data: { priorityFields: [], otherFields: [] },
      };
      render(<BoardingFormModal {...baseProps} formData={formData} />);
      expect(screen.queryByRole('button', { name: /Print/i })).not.toBeInTheDocument();
    });
  });
});
