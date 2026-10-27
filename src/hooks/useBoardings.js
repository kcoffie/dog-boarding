import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useBoardings() {
  const { user } = useAuth();
  const [boardings, setBoardings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBoardings = useCallback(async () => {
    if (!user) {
      setBoardings([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('boardings')
        .select('*')
        .order('arrival_datetime', { ascending: false });

      if (error) throw error;

      // Transform from DB format to app format
      setBoardings(data.map(b => ({
        id: b.id,
        dogId: b.dog_id,
        arrivalDateTime: b.arrival_datetime,
        departureDateTime: b.departure_datetime,
        arrivalAmPm: b.arrival_ampm ?? null,
        departureAmPm: b.departure_ampm ?? null,
        nightRate: b.night_rate != null ? parseFloat(b.night_rate) : null,
        billedAmount: b.billed_amount != null ? parseFloat(b.billed_amount) : null,
        source: b.source ?? null,
        bookingStatus: b.booking_status ?? 'confirmed',
        cancelledAt: b.cancelled_at ?? null,
      })));
    } catch (err) {
      console.error('Error fetching boardings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBoardings();
  }, [fetchBoardings]);

  return {
    boardings,
    loading,
    error,
    refresh: fetchBoardings,
  };
}
