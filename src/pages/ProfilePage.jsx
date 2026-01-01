import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Password updated successfully' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">My Profile</h1>

      {/* User Info Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center text-white text-2xl font-semibold">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Account Details</h2>
            <p className="text-slate-600">{user?.email}</p>
            <p className="text-xs text-slate-400 mt-1">
              Member since {new Date(user?.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Change Password</h2>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {message.text && (
            <div
              className={`p-3 rounded-lg text-sm ${
                message.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              }`}
            >
              {message.text}
            </div>
          )}

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              placeholder="Enter new password"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-lg shadow-sm transition-all"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
