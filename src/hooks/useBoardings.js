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

  const addBoarding = async (boarding) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('boardings')
        .insert([{
          dog_id: boarding.dogId,
          arrival_datetime: boarding.arrivalDateTime,
          departure_datetime: boarding.departureDateTime,
        }])
        .select()
        .single();

      if (error) throw error;

      const newBoarding = {
        id: data.id,
        dogId: data.dog_id,
        arrivalDateTime: data.arrival_datetime,
        departureDateTime: data.departure_datetime,
      };

      setBoardings(prev => [newBoarding, ...prev]);
      return newBoarding;
    } catch (err) {
      console.error('Error adding boarding:', err);
      setError(err.message);
      throw err;
    }
  };

  const addBoardings = async (newBoardings) => {
    if (!user || !newBoardings.length) return;

    try {
      const { data, error } = await supabase
        .from('boardings')
        .insert(newBoardings.map(b => ({
          dog_id: b.dogId,
          arrival_datetime: b.arrivalDateTime,
          departure_datetime: b.departureDateTime,
        })))
        .select();

      if (error) throw error;

      const addedBoardings = data.map(b => ({
        id: b.id,
        dogId: b.dog_id,
        arrivalDateTime: b.arrival_datetime,
        departureDateTime: b.departure_datetime,
      }));

      setBoardings(prev => [...addedBoardings, ...prev]);
      return addedBoardings;
    } catch (err) {
      console.error('Error adding boardings:', err);
      setError(err.message);
      throw err;
    }
  };

  const updateBoarding = async (id, updates) => {
    if (!user) return;

    try {
      const dbUpdates = {};
      if (updates.dogId !== undefined) dbUpdates.dog_id = updates.dogId;
      if (updates.arrivalDateTime !== undefined) dbUpdates.arrival_datetime = updates.arrivalDateTime;
      if (updates.departureDateTime !== undefined) dbUpdates.departure_datetime = updates.departureDateTime;

      const { error } = await supabase
        .from('boardings')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      setBoardings(prev => prev.map(b =>
        b.id === id ? { ...b, ...updates } : b
      ));
    } catch (err) {
      console.error('Error updating boarding:', err);
      setError(err.message);
      throw err;
    }
  };

  const deleteBoarding = async (id) => {
    if (!user) return;

    try {
      // Null FK on sync_appointments before delete to avoid 23503 constraint error
      console.log('[deleteBoarding] Nulling mapped_boarding_id for boarding id=%s', id);
      const { error: nullError } = await supabase
        .from('sync_appointments')
        .update({ mapped_boarding_id: null })
        .eq('mapped_boarding_id', id);

      if (nullError) throw nullError;

      const { error } = await supabase
        .from('boardings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setBoardings(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('[deleteBoarding] Failed for boarding id=%s:', id, err);
      setError(err.message);
      throw err;
    }
  };

  const deleteBoardingsForDog = async (dogId) => {
    if (!user) return;

    try {
      // Fetch boarding IDs first so we can null their FKs (no subquery support in Supabase JS)
      const { data: boardingRows, error: fetchError } = await supabase
        .from('boardings')
        .select('id')
        .eq('dog_id', dogId);

      if (fetchError) throw fetchError;

      // Guard against Supabase returning null data on a network error that
      // didn't populate the error field (rare but possible).
      const boardingIds = (boardingRows ?? []).map(b => b.id);

      if (boardingIds.length > 0) {
        console.log('[deleteBoardingsForDog] Nulling mapped_boarding_id for %d boardings, dog_id=%s', boardingIds.length, dogId);
        const { error: nullError } = await supabase
          .from('sync_appointments')
          .update({ mapped_boarding_id: null })
          .in('mapped_boarding_id', boardingIds);

        if (nullError) throw nullError;
      } else {
        console.log('[deleteBoardingsForDog] No boardings found for dog_id=%s — skipping FK null step', dogId);
      }

      const { error } = await supabase
        .from('boardings')
        .delete()
        .eq('dog_id', dogId);

      if (error) throw error;

      setBoardings(prev => prev.filter(b => b.dogId !== dogId));
    } catch (err) {
      console.error('[deleteBoardingsForDog] Failed for dog_id=%s:', dogId, err);
      setError(err.message);
      throw err;
    }
  };

  return {
    boardings,
    loading,
    error,
    addBoarding,
    addBoardings,
    updateBoarding,
    deleteBoarding,
    deleteBoardingsForDog,
    refresh: fetchBoardings,
  };
}
