import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No settings found - create default settings
          const { data: newSettings, error: insertError } = await supabase
            .from('settings')
            .insert([{
              user_id: user.id,
              net_percentage: 65.00,
              net_percentage_history: []
            }])
            .select()
            .single();

          if (insertError) throw insertError;
          setSettings(transformFromDb(newSettings));
        } else {
          throw error;
        }
      } else {
        setSettings(transformFromDb(data));
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Transform from DB format to app format
  function transformFromDb(dbSettings) {
    if (!dbSettings) return null;
    return {
      id: dbSettings.id,
      netPercentage: parseFloat(dbSettings.net_percentage),
      netPercentageHistory: dbSettings.net_percentage_history || [],
    };
  }

  // Transform from app format to DB format
  function transformToDb(appSettings) {
    return {
      net_percentage: appSettings.netPercentage,
      net_percentage_history: appSettings.netPercentageHistory || [],
    };
  }

  const updateNetPercentage = async (percentage, effectiveDate = null) => {
    if (!user || !settings) return;

    try {
      let newHistory = settings.netPercentageHistory || [];

      if (effectiveDate) {
        // Add to history - remove any existing entry for this exact date
        newHistory = newHistory.filter(h => h.effectiveDate !== effectiveDate);
        newHistory = [...newHistory, { effectiveDate, percentage }];
      } else {
        // Retroactive - clear history
        newHistory = [];
      }

      const updates = {
        net_percentage: percentage,
        net_percentage_history: newHistory,
      };

      const { error } = await supabase
        .from('settings')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;

      setSettings(prev => ({
        ...prev,
        netPercentage: percentage,
        netPercentageHistory: newHistory,
      }));
    } catch (err) {
      console.error('Error updating net percentage:', err);
      setError(err.message);
      throw err;
    }
  };

  const getNetPercentageForDate = useCallback((dateStr) => {
    if (!settings) return 65; // Default

    const history = settings.netPercentageHistory || [];
    if (history.length === 0) {
      return settings.netPercentage;
    }

    // Sort by effectiveDate descending to find most recent applicable
    const sorted = [...history].sort((a, b) =>
      b.effectiveDate.localeCompare(a.effectiveDate)
    );

    for (const entry of sorted) {
      if (entry.effectiveDate <= dateStr) {
        return entry.percentage;
      }
    }

    // Date is before any history entries, use the first entry's percentage
    return sorted[sorted.length - 1].percentage;
  }, [settings]);

  return {
    settings,
    loading,
    error,
    updateNetPercentage,
    getNetPercentageForDate,
    refresh: fetchSettings,
  };
}
