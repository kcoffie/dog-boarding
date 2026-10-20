/**
 * No self sign-up: an old /signup link lands on the login page.
 * @requirements REQ-001
 *
 * Every page is a stub that names itself; only App's routes are under test.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../context/DataContext', () => ({ DataProvider: ({ children }) => children }));
const stub = (name) => ({ default: () => <p>{name}</p> });
vi.mock('../../pages/auth/LoginPage', () => stub('login page'));
vi.mock('../../pages/auth/ForgotPasswordPage', () => stub('forgot page'));
vi.mock('../../pages/auth/ResetPasswordPage', () => stub('reset page'));
vi.mock('../../pages/PrivacyPage', () => stub('privacy page'));
vi.mock('../../pages/TermsPage', () => stub('terms page'));
vi.mock('../../components/auth/ProtectedRoute', () => stub('protected'));

const { default: App } = await import('../../App');

describe('REQ-001: no self sign-up', () => {
  it('/signup redirects to /login', () => {
    window.history.pushState({}, '', '/signup');
    render(<App />);
    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
