import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useInvites() {
  const { user } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInvites = useCallback(async () => {
    if (!user) {
      setInvites([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('invite_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setInvites(data || []);
    } catch (err) {
      console.error('Error fetching invites:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const createInvite = async (email = null) => {
    if (!user) return null;

    try {
      // Generate random 8-character code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();

      const { data, error } = await supabase
        .from('invite_codes')
        .insert([{
          code,
          email: email || null,
          created_by: user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        }])
        .select()
        .single();

      if (error) throw error;

      setInvites(prev => [data, ...prev]);
      return data;
    } catch (err) {
      console.error('Error creating invite:', err);
      setError(err.message);
      throw err;
    }
  };

  const deleteInvite = async (id) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('invite_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setInvites(prev => prev.filter(inv => inv.id !== id));
    } catch (err) {
      console.error('Error deleting invite:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    invites,
    loading,
    error,
    createInvite,
    deleteInvite,
    refresh: fetchInvites,
  };
}
