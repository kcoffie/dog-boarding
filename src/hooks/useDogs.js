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
        .eq('user_id', user.id)
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

  const addDog = async (dog) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('dogs')
        .insert([{
          user_id: user.id,
          name: dog.name,
          day_rate: dog.dayRate,
          night_rate: dog.nightRate,
          notes: dog.notes || '',
          active: true,
        }])
        .select()
        .single();

      if (error) throw error;

      const newDog = {
        id: data.id,
        name: data.name,
        dayRate: parseFloat(data.day_rate),
        nightRate: parseFloat(data.night_rate),
        notes: data.notes || '',
        active: data.active,
      };

      setDogs(prev => [...prev, newDog]);
      return newDog;
    } catch (err) {
      console.error('Error adding dog:', err);
      setError(err.message);
      throw err;
    }
  };

  const addDogs = async (newDogs) => {
    if (!user || !newDogs.length) return;

    try {
      const { data, error } = await supabase
        .from('dogs')
        .insert(newDogs.map(dog => ({
          user_id: user.id,
          name: dog.name,
          day_rate: dog.dayRate,
          night_rate: dog.nightRate,
          notes: dog.notes || '',
          active: true,
        })))
        .select();

      if (error) throw error;

      const addedDogs = data.map(dog => ({
        id: dog.id,
        name: dog.name,
        dayRate: parseFloat(dog.day_rate),
        nightRate: parseFloat(dog.night_rate),
        notes: dog.notes || '',
        active: dog.active,
      }));

      setDogs(prev => [...prev, ...addedDogs]);
      return addedDogs;
    } catch (err) {
      console.error('Error adding dogs:', err);
      setError(err.message);
      throw err;
    }
  };

  const updateDog = async (id, updates) => {
    if (!user) return;

    try {
      const dbUpdates = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.dayRate !== undefined) dbUpdates.day_rate = updates.dayRate;
      if (updates.nightRate !== undefined) dbUpdates.night_rate = updates.nightRate;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      if (updates.active !== undefined) dbUpdates.active = updates.active;

      const { error } = await supabase
        .from('dogs')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;

      setDogs(prev => prev.map(dog =>
        dog.id === id ? { ...dog, ...updates } : dog
      ));
    } catch (err) {
      console.error('Error updating dog:', err);
      setError(err.message);
      throw err;
    }
  };

  const deleteDog = async (id) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('dogs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setDogs(prev => prev.filter(dog => dog.id !== id));
    } catch (err) {
      console.error('Error deleting dog:', err);
      setError(err.message);
      throw err;
    }
  };

  const toggleDogActive = async (id) => {
    const dog = dogs.find(d => d.id === id);
    if (!dog) return;

    await updateDog(id, { active: !dog.active });
  };

  return {
    dogs,
    loading,
    error,
    addDog,
    addDogs,
    updateDog,
    deleteDog,
    toggleDogActive,
    refresh: fetchDogs,
  };
}
