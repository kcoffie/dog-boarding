import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock Supabase before importing components
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            single: vi.fn(),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(),
      })),
    })),
    auth: {
      signUp: vi.fn(),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

import SignupPage from '../../pages/auth/SignupPage';
import { AuthProvider } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const renderSignupPage = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <SignupPage />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Invite Code System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invite Code Validation UI', () => {
    it('shows invite code input on initial render', () => {
      renderSignupPage();
      expect(screen.getByText('Join the team')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('XXXXXXXX')).toBeInTheDocument();
    });

    it('has Continue button initially disabled without code', () => {
      renderSignupPage();
      const continueBtn = screen.getByRole('button', { name: /continue/i });
      expect(continueBtn).toBeDisabled();
    });

    it('enables Continue button when code is entered', () => {
      renderSignupPage();
      const codeInput = screen.getByPlaceholderText('XXXXXXXX');
      fireEvent.change(codeInput, { target: { value: 'TESTCODE' } });

      const continueBtn = screen.getByRole('button', { name: /continue/i });
      expect(continueBtn).not.toBeDisabled();
    });

    it('converts code to uppercase automatically', () => {
      renderSignupPage();
      const codeInput = screen.getByPlaceholderText('XXXXXXXX');
      fireEvent.change(codeInput, { target: { value: 'lowercase' } });
      expect(codeInput.value).toBe('LOWERCASE');
    });

    it('limits code length to 12 characters', () => {
      renderSignupPage();
      const codeInput = screen.getByPlaceholderText('XXXXXXXX');
      expect(codeInput.getAttribute('maxLength')).toBe('12');
    });

    it('shows link to sign in for existing users', () => {
      renderSignupPage();
      expect(screen.getByText('Already have an account?')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    });
  });
});
