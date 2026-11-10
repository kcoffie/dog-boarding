import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DeletePaymentDialog from './DeletePaymentDialog';

/**
 * #389: deleting a payment asks for an optional note, and one click deletes once.
 * @requirements REQ-042
 */
describe('REQ-042: the delete-payment box (#389)', () => {
  const box = (props = {}) => (
    <DeletePaymentDialog
      isOpen
      message="Delete payment of $65.00 to Avery?"
      onConfirm={vi.fn().mockResolvedValue(undefined)}
      onCancel={vi.fn()}
      {...props}
    />
  );

  it('closed: shows nothing', () => {
    render(box({ isOpen: false }));
    expect(screen.queryByText('Delete Payment Record')).not.toBeInTheDocument();
  });

  it('sends the note as typed (the hook trims it)', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(box({ onConfirm }));
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: ' paid twice ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    expect(onConfirm).toHaveBeenCalledWith(' paid twice ');
  });

  it('with no note typed, sends an empty note', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(box({ onConfirm }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })); });
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  it('a second click while deleting does nothing, and both buttons are disabled', async () => {
    let finish;
    const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(box({ onConfirm }));
    const del = screen.getByRole('button', { name: 'Delete' });
    fireEvent.click(del);
    fireEvent.click(del);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(del).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await act(async () => finish());
    expect(del).not.toBeDisabled();
  });

  it('a failed delete enables the buttons again', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('network down'));
    render(box({ onConfirm }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Delete' })).not.toBeDisabled();
  });

  it('Cancel cancels', () => {
    const onCancel = vi.fn();
    render(box({ onCancel }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('the backdrop cancels, but not while deleting', async () => {
    let finish;
    const onCancel = vi.fn();
    const onConfirm = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { container } = render(box({ onCancel, onConfirm }));
    const backdrop = container.querySelector('.bg-black\\/40');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(backdrop);
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => finish());
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
