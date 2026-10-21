/**
 * /api/site-access — the booking-site breaker on the Settings page (#324, REQ-657).
 *
 * GET:  { blocked, reason, since } only. Never the session.
 * POST: Clear. One conditional update clears it (only while blocked, so a double press clears and
 *       logs in once) and records who and when; then it logs in at once through loginToSite, the
 *       same login as cron-auth. A refused login trips it again, with a new alert.
 *       → { ok, loggedIn, error? }; 409 when it wasn't blocked.
 *
 * Auth: Authorization: Bearer {the signed-in user's Supabase access token} (REQ-656).
 * Env:  VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *       EXTERNAL_SITE_USERNAME, EXTERNAL_SITE_PASSWORD, TELEGRAM_* (the alert on a re-trip).
 *
 * @requirements REQ-657, REQ-656
 */

import { createClient } from '@supabase/supabase-js';
import { verifyUser } from '../src/lib/verifyUser.js';
import { readSiteAccess, clearBreaker } from '../src/lib/scraper/siteAccess.js';
import { loginToSite } from '../src/lib/scraper/siteLogin.js';

export const config = { runtime: 'nodejs' };

function serviceDb() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server misconfigured: Supabase service key not set');
  return createClient(url, key);
}

/** @param {{ getDb?: Function, login?: typeof loginToSite, verify?: typeof verifyUser }} [deps] */
export function makeHandler({ getDb = serviceDb, login = loginToSite, verify = verifyUser } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const auth = await verify(req.headers['authorization']);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

    try {
      const db = getDb();

      if (req.method === 'GET') {
        const row = await readSiteAccess(db);
        return res.status(200).json({
          blocked: Boolean(row?.blocked_at),
          reason: row?.blocked_reason ?? null,
          since: row?.blocked_at ?? null,
        });
      }

      const who = auth.user.email ?? auth.user.id;
      const cleared = await clearBreaker(db, who);
      if (!cleared) {
        return res.status(409).json({ ok: false, loggedIn: false, error: 'The booking site is not blocked' });
      }
      console.log(`[SiteAccess] Cleared by user=${auth.user.id}; logging in`);

      const result = await login(db);
      if (!result.ok) {
        console.error(`[SiteAccess] Login after Clear failed: ${result.error}`);
        return res.status(502).json({ ok: false, loggedIn: false, error: result.error });
      }
      return res.status(200).json({ ok: true, loggedIn: true });
    } catch (err) {
      console.error('[SiteAccess] Error:', err.message);
      return res.status(500).json({ ok: false, error: 'Could not read or update the booking-site status' });
    }
  };
}

export default makeHandler();
