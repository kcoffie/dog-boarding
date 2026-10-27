import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useDogs() {
  const { user } = useAuth();
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDogs = useCallback(async () => {
    if (!user) {
      setDogs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('dogs')
        .select('*')
        .order('name');

      if (error) throw error;

      // Transform from DB format to app format
      setDogs(data.map(dog => ({
        id: dog.id,
        name: dog.name,
        dayRate: parseFloat(dog.day_rate),
        nightRate: parseFloat(dog.night_rate),
        notes: dog.notes || '',
        active: dog.active,
      })));
    } catch (err) {
      console.error('Error fetching dogs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDogs();
  }, [fetchDogs]);

  return {
    dogs,
    loading,
    error,
    // Dogs come only from the booking site's sync: no add, edit, delete or deactivate here (#351)
    refresh: fetchDogs,
  };
}
