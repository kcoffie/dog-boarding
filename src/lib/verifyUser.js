/* global process */
/**
 * Verify a browser caller's Supabase user token (REQ-656). Shared by api/send-question.js (nodejs)
 * and api/sync-proxy.js (edge), so it uses only fetch and AbortSignal.
 *
 * Fails closed: missing env is a 500, and an error, a timeout or any non-200 answer is never a pass.
 * @requirements REQ-656
 */

export const VERIFY_TIMEOUT_MS = 5000;

/**
 * @param {string|null|undefined} authorization  the request's Authorization header
 * @param {{ env?: object, fetchFn?: typeof fetch }} [deps]
 * @returns {Promise<{ ok: true, user: { id: string, email: string|null } }
 *                 | { ok: false, status: 401|500|503, error: string }>}
 */
export async function verifyUser(authorization, { env = process.env, fetchFn = fetch } = {}) {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, status: 500, error: 'Server misconfigured' };

  const jwt = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
  if (!jwt) return { ok: false, status: 401, error: 'Unauthorized' };

  let res;
  try {
    res = await fetchFn(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 503, error: 'Sign-in check unavailable' };
  }
  if (res.status >= 500) return { ok: false, status: 503, error: 'Sign-in check unavailable' };
  if (res.status !== 200) return { ok: false, status: 401, error: 'Unauthorized' };

  let user;
  try {
    user = await res.json();
  } catch {
    return { ok: false, status: 503, error: 'Sign-in check unavailable' };
  }
  if (!user?.id) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true, user: { id: user.id, email: user.email ?? null } };
}
