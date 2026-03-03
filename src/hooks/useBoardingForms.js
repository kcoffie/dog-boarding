/**
 * Hook: fetch boarding_forms for current and upcoming boardings.
 * @requirements REQ-503, REQ-504
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns true if the boarding's departure is today or in the future.
 * @param {{ departureDateTime: string }} boarding
 * @returns {boolean}
 */
export function isBoardingUpcoming(boarding) {
  if (!boarding?.departureDateTime) return false;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return new Date(boarding.departureDateTime) >= todayMidnight;
}

/**
 * Fetches all boarding_forms rows for boardings whose departure is today or future.
 * Returns a map of boardingId → formData for easy lookup.
 *
 * @returns {{ formsByBoardingId: Object, isLoading: boolean }}
 */
export function useBoardingForms() {
  const [formsByBoardingId, setFormsByBoardingId] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchForms() {
      setIsLoading(true);
      try {
        // Get today's midnight as ISO string for server-side filtering
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        // Join boarding_forms with boardings to filter by departure date.
        // We fetch all boarding_forms and filter client-side based on the
        // boarding's departure_datetime via a joined query.
        const { data, error } = await supabase
          .from('boarding_forms')
          .select(`
            *,
            boardings!boarding_id(id, departure_datetime)
          `)
          .gte('boardings.departure_datetime', todayMidnight.toISOString());

        if (error) throw error;

        const map = {};
        for (const form of (data || [])) {
          if (form.boarding_id) {
            map[form.boarding_id] = form;
          }
        }
        setFormsByBoardingId(map);
      } catch (err) {
        console.error('[useBoardingForms] Failed to fetch boarding forms:', err.message);
        setFormsByBoardingId({});
      } finally {
        setIsLoading(false);
      }
    }

    fetchForms();
  }, []);

  return { formsByBoardingId, isLoading };
}
