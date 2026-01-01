import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DogForm from './DogForm';

// Helper to get inputs by their placeholder or position
const getNameInput = () => screen.getByPlaceholderText(/enter dog name/i);
const getDayRateInput = () => screen.getAllByRole('spinbutton')[0];
const getNightRateInput = () => screen.getAllByRole('spinbutton')[1];

/**
 * @requirements REQ-010, REQ-011
 */
describe('REQ-010, REQ-011: DogForm', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields', () => {
    render(<DogForm onSave={mockOnSave} />);

    expect(screen.getByText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByText(/day rate/i)).toBeInTheDocument();
    expect(screen.getByText(/night rate/i)).toBeInTheDocument();
  });

  it('renders Add Dog button for new dog', () => {
    render(<DogForm onSave={mockOnSave} />);
    expect(screen.getByRole('button', { name: /add dog/i })).toBeInTheDocument();
  });

  it('renders Save Changes button when editing', () => {
    const existingDog = { id: '1', name: 'Luna', dayRate: 35, nightRate: 45 };
    render(<DogForm dog={existingDog} onSave={mockOnSave} />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('renders cancel button when onCancel provided', () => {
    render(<DogForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls onCancel when cancel clicked', async () => {
    const user = userEvent.setup();
    render(<DogForm onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('validates required name field', async () => {
    const user = userEvent.setup();
    render(<DogForm onSave={mockOnSave} />);

    // Fill rates but leave name empty
    await user.type(getDayRateInput(), '35');
    await user.type(getNightRateInput(), '45');
    await user.click(screen.getByRole('button', { name: /add dog/i }));

    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates missing day rate', async () => {
    const user = userEvent.setup();
    render(<DogForm onSave={mockOnSave} />);

    await user.type(getNameInput(), 'Luna');
    // Leave day rate empty, only fill night rate
    await user.type(getNightRateInput(), '45');
    await user.click(screen.getByRole('button', { name: /add dog/i }));

    expect(screen.getByText(/valid positive number/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('calls onSave with valid data', async () => {
    const user = userEvent.setup();
    render(<DogForm onSave={mockOnSave} />);

    await user.type(getNameInput(), 'Luna');
    await user.type(getDayRateInput(), '35');
    await user.type(getNightRateInput(), '45');
    await user.click(screen.getByRole('button', { name: /add dog/i }));

    expect(mockOnSave).toHaveBeenCalledWith({
      name: 'Luna',
      dayRate: 35,
      nightRate: 45,
    });
  });

  it('populates fields when editing existing dog', () => {
    const existingDog = { id: '1', name: 'Luna', dayRate: 35, nightRate: 45 };
    render(<DogForm dog={existingDog} onSave={mockOnSave} />);

    expect(getNameInput()).toHaveValue('Luna');
    expect(getDayRateInput()).toHaveValue(35);
    expect(getNightRateInput()).toHaveValue(45);
  });

  it('clears form after successful add', async () => {
    const user = userEvent.setup();
    render(<DogForm onSave={mockOnSave} />);

    await user.type(getNameInput(), 'Luna');
    await user.type(getDayRateInput(), '35');
    await user.type(getNightRateInput(), '45');
    await user.click(screen.getByRole('button', { name: /add dog/i }));

    // Form should be cleared
    expect(getNameInput()).toHaveValue('');
  });
});
