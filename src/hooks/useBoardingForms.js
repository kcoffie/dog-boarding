/**
 * Hook: fetch boarding_forms for current and upcoming boardings.
 * @requirements REQ-503, REQ-504
 */

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { siteDate, siteNow } from '../utils/siteClock';

/**
 * Returns true if the boarding departs today or later, in San Francisco (#353: booking
 * times are site clock values, so compare site dates).
 * @param {{ departureDateTime: string }} boarding
 * @returns {boolean}
 */
export function isBoardingUpcoming(boarding) {
  if (!boarding?.departureDateTime) return false;
  return siteDate(boarding.departureDateTime) >= siteDate(siteNow());
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
        // Today's midnight on the site clock (San Francisco's date written as UTC)
        const todayMidnight = `${siteDate(siteNow())}T00:00:00.000Z`;

        // Join boarding_forms with boardings to filter by departure date. !inner makes
        // the filter drop the form; without it, it only drops the embedded boarding.
        const { data, error } = await supabase
          .from('boarding_forms')
          .select(`
            *,
            boardings!boarding_id!inner(id, departure_datetime)
          `)
          .gte('boardings.departure_datetime', todayMidnight);

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
