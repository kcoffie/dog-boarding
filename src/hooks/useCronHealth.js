/**
 * Hook: fetch cron health rows from cron_health table.
 * @requirements REQ-401
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useCronHealth() {
  const [cronHealth, setCronHealth] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('cron_health')
        .select('*')
        .order('cron_name');
      setCronHealth(data || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { cronHealth, loading };
}
