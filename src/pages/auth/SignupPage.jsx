import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import AuthLayout from '../../components/auth/AuthLayout';

export default function SignupPage() {
  const [step, setStep] = useState('code'); // 'code' | 'register'
  const [inviteCode, setInviteCode] = useState('');
  const [inviteData, setInviteData] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { signUp } = useAuth();
  const navigate = useNavigate();

  // Step 1: Validate invite code
  const handleValidateCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('invite_codes')
        .select('*')
        .eq('code', inviteCode.trim().toUpperCase())
        .is('used_by', null)
        .single();

      if (error || !data) {
        setError('Invalid or expired invite code');
        setLoading(false);
        return;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setError('This invite code has expired');
        setLoading(false);
        return;
      }

      // If invite is locked to specific email, pre-fill it
      if (data.email) {
        setEmail(data.email);
      }

      setInviteData(data);
      setStep('register');
    } catch (err) {
      setError('Failed to validate invite code');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Create account
  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');

    // Validate email matches invite if locked
    if (inviteData.email && email.toLowerCase() !== inviteData.email.toLowerCase()) {
      setError(`This invite is for ${inviteData.email}`);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const { user } = await signUp(email, password);

      if (user) {
        // Mark invite as used
        await supabase
          .from('invite_codes')
          .update({
            used_by: user.id,
            used_at: new Date().toISOString(),
          })
          .eq('id', inviteData.id);

        // User is logged in immediately
        navigate('/');
      } else {
        // Email confirmation required
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout title="Check your email" subtitle="We've sent you a confirmation link">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-slate-600 mb-6">
            Please check your email and click the confirmation link to activate your account.
          </p>
          <Link
            to="/login"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Return to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // Step 1: Enter invite code
  if (step === 'code') {
    return (
      <AuthLayout title="Join the team" subtitle="Enter your invite code to create an account">
        <form onSubmit={handleValidateCode} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-slate-700 mb-1.5">
              Invite Code
            </label>
            <input
              id="inviteCode"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              required
              autoFocus
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors font-mono text-center text-lg tracking-widest"
              placeholder="XXXXXXXX"
              maxLength={12}
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Ask your administrator for an invite code
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !inviteCode.trim()}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 active:scale-[0.99] text-white font-medium rounded-lg shadow-sm transition-all"
          >
            {loading ? 'Checking...' : 'Continue'}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </AuthLayout>
    );
  }

  // Step 2: Create account
  return (
    <AuthLayout title="Create account" subtitle="Complete your registration">
      <form onSubmit={handleSignup} className="space-y-5">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Invite code verified</span>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!!inviteData.email}
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors disabled:bg-slate-100 disabled:text-slate-500"
            placeholder="you@example.com"
          />
          {inviteData.email && (
            <p className="mt-1 text-xs text-slate-500">
              This invite is for this email address
            </p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            placeholder="••••••••"
            minLength={6}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
            placeholder="••••••••"
            minLength={6}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 active:scale-[0.99] text-white font-medium rounded-lg shadow-sm transition-all"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => {
            setStep('code');
            setError('');
          }}
          className="w-full text-center text-sm text-slate-600 hover:text-slate-800"
        >
          Use a different invite code
        </button>
      </form>
    </AuthLayout>
  );
}
