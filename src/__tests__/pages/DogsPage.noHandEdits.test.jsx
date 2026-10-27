import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// The booking site is the source of truth for dogs (Kate, 2026-10-23): the Dogs page
// shows them and changes nothing (#351). Synthetic names.
const mockData = { dogs: [], boardings: [] };

vi.mock('../../hooks/useBoardingForms', () => ({
  useBoardingForms: vi.fn(() => ({ formsByBoardingId: {} })),
  isBoardingUpcoming: vi.fn(() => false),
}));

vi.mock('../../context/DataContext', () => ({
  useData: () => ({ dogs: mockData.dogs, boardings: mockData.boardings }),
}));

import DogsPage from '../../pages/DogsPage';

const renderDogsPage = (dogs) => {
  mockData.dogs = dogs;
  return render(
    <BrowserRouter>
      <DogsPage />
    </BrowserRouter>
  );
};

const dogsSection = () => screen.getByRole('heading', { name: 'Dogs' }).closest('div').parentElement.parentElement;

/**
 * @requirements REQ-010, REQ-012, REQ-013
 */
describe('REQ-010, REQ-012, REQ-013: the Dogs page has no hand edits (#351)', () => {
  const dogs = [
    { id: 'dog-1', name: 'Biscuit Sample', dayRate: 25, nightRate: 50, active: true },
    { id: 'dog-2', name: 'Clover Sample', dayRate: 30, nightRate: 60, active: false },
  ];

  it('offers no Add Dog, Import CSV, Deactivate or Activate control', () => {
    renderDogsPage(dogs);
    for (const label of [/add dog/i, /import csv/i, /deactivate/i, /^activate$/i]) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument();
    }
  });

  it('has no buttons at all in the dog list, and no Actions column', () => {
    renderDogsPage(dogs);
    const section = dogsSection();
    expect(within(section).getByText('From the booking site')).toBeInTheDocument();
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    expect(within(section).queryByText('Actions')).not.toBeInTheDocument();
  });

  it('still lists an inactive dog, with its rates', () => {
    renderDogsPage(dogs);
    const section = dogsSection();
    // once in the phone layout, once in the desktop table
    expect(within(section).getAllByText('Clover Sample')).toHaveLength(2);
    expect(within(section).getAllByText('$60.00')).toHaveLength(2);
  });

  it('with no dogs, says they come from the booking site, not "Click Add Dog"', () => {
    renderDogsPage([]);
    expect(screen.getByText('Dogs appear here after the booking site syncs')).toBeInTheDocument();
    expect(screen.queryByText(/click "add dog"/i)).not.toBeInTheDocument();
  });
});
