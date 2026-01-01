import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock Supabase
const mockUpdateUser = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
    },
  },
}));

import ProfilePage from '../../pages/ProfilePage';
import { AuthContext } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
};

const renderProfilePage = (user = mockUser) => {
  return render(
    <BrowserRouter>
      <AuthContext.Provider value={{ user, signOut: vi.fn() }}>
        <ProfilePage />
      </AuthContext.Provider>
    </BrowserRouter>
  );
};

describe('User Self-Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabase.auth.updateUser.mockReset();
  });

  describe('Profile Display', () => {
    it('displays current user email on profile page', () => {
      renderProfilePage();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('My Profile')).toBeInTheDocument();
    });

    it('displays user avatar with first letter of email', () => {
      renderProfilePage();
      expect(screen.getByText('T')).toBeInTheDocument();
    });

    it('displays Account Details section', () => {
      renderProfilePage();
      expect(screen.getByText('Account Details')).toBeInTheDocument();
    });
  });

  describe('Password Change Form', () => {
    it('shows password change form', () => {
      renderProfilePage();
      expect(screen.getByText('Change Password')).toBeInTheDocument();
      expect(screen.getByLabelText('New Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
    });

    it('has Update Password button', () => {
      renderProfilePage();
      expect(screen.getByRole('button', { name: /update password/i })).toBeInTheDocument();
    });

    it('rejects password change if passwords do not match', async () => {
      renderProfilePage();

      const newPasswordInput = screen.getByLabelText('New Password');
      const confirmInput = screen.getByLabelText('Confirm New Password');

      fireEvent.change(newPasswordInput, { target: { value: 'password1' } });
      fireEvent.change(confirmInput, { target: { value: 'password2' } });

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });

      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it('rejects password shorter than 6 characters', async () => {
      renderProfilePage();

      const newPasswordInput = screen.getByLabelText('New Password');
      const confirmInput = screen.getByLabelText('Confirm New Password');

      fireEvent.change(newPasswordInput, { target: { value: '12345' } });
      fireEvent.change(confirmInput, { target: { value: '12345' } });

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
      });

      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    });

    it('calls updateUser with valid password', async () => {
      supabase.auth.updateUser.mockResolvedValueOnce({ error: null });
      renderProfilePage();

      const newPasswordInput = screen.getByLabelText('New Password');
      const confirmInput = screen.getByLabelText('Confirm New Password');

      fireEvent.change(newPasswordInput, { target: { value: 'validpassword123' } });
      fireEvent.change(confirmInput, { target: { value: 'validpassword123' } });

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'validpassword123' });
      });
    });

    it('shows success message after successful update', async () => {
      supabase.auth.updateUser.mockResolvedValueOnce({ error: null });
      renderProfilePage();

      const newPasswordInput = screen.getByLabelText('New Password');
      const confirmInput = screen.getByLabelText('Confirm New Password');

      fireEvent.change(newPasswordInput, { target: { value: 'newpassword123' } });
      fireEvent.change(confirmInput, { target: { value: 'newpassword123' } });

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Password updated successfully')).toBeInTheDocument();
      });
    });

    it('shows error message from Supabase on failure', async () => {
      supabase.auth.updateUser.mockResolvedValueOnce({
        error: { message: 'Password too weak' }
      });
      renderProfilePage();

      const newPasswordInput = screen.getByLabelText('New Password');
      const confirmInput = screen.getByLabelText('Confirm New Password');

      fireEvent.change(newPasswordInput, { target: { value: 'weakpw' } });
      fireEvent.change(confirmInput, { target: { value: 'weakpw' } });

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText('Password too weak')).toBeInTheDocument();
      });
    });
  });
});
