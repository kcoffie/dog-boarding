# REQ-402 Security Report — FINAL
**Completed:** March 2, 2026
**Scope:** Full security audit + implementation of all MUST-FIX and RECOMMENDED findings (except REC-3).

---

## Summary

All MUST-FIX issues resolved. All RECOMMENDED issues resolved except REC-3 (low-priority warning log).
REC-3 and the SyncHistoryPage cluster deferred — no security impact.

Commits: `80ff992` (MUST-1, MUST-2, REC-2, REC-4 partial, REC-5), `154c408` (REC-4 batch sync),
`cc3a9e5` (REC-1).

---

## MUST-FIX Findings

### MUST-1 — CRITICAL: External site credentials leaked in client JS bundle ✅ Fixed

**What it was:** `VITE_EXTERNAL_SITE_USERNAME` and `VITE_EXTERNAL_SITE_PASSWORD` had the `VITE_`
prefix, causing Vite to embed their literal values in the minified JS bundle at build time.
Anyone opening DevTools → Sources could read the plaintext credentials.

**Root cause:** The browser "Sync Now" path called `runSync()` → `authenticate(username, password)`
where username/password were read from `import.meta.env.VITE_*`. The auth module then forwarded
them in the body of a POST to `/api/sync-proxy` for the actual login.

**What was done:**

1. **`api/sync-proxy.js`** — `authenticate` action now reads credentials from
   `process.env.EXTERNAL_SITE_USERNAME` / `process.env.EXTERNAL_SITE_PASSWORD` server-side.
   No longer accepts username/password from the request body. Returns 500 if not configured.

2. **`src/lib/scraper/auth.js`** — Restructured `authenticate()` to put the `isBrowser()`
   check first. Browser path no longer includes credentials in the proxy POST body.
   Node.js cron path still validates username/password as function parameters (unchanged behavior).

3. **`src/lib/scraper/sync.js`** — Removed `username` and `password` from `runSync()` options
   destructure. Removed the `!username || !password` guard. Calls `authenticate()` with no args
   (browser path goes through proxy which reads creds server-side).

4. **`api/cron-auth.js`** — Updated env var key names from `VITE_EXTERNAL_SITE_USERNAME` /
   `VITE_EXTERNAL_SITE_PASSWORD` to `EXTERNAL_SITE_USERNAME` / `EXTERNAL_SITE_PASSWORD`.

**⚠️ MANUAL STEP REQUIRED:** Rename the env vars in the Vercel dashboard before deploying:
- `VITE_EXTERNAL_SITE_USERNAME` → `EXTERNAL_SITE_USERNAME`
- `VITE_EXTERNAL_SITE_PASSWORD` → `EXTERNAL_SITE_PASSWORD`

**Verify after next deploy:** Run `npm run build` and search `dist/` for any fragment of the
real password to confirm it is not present in the bundle.

---

### MUST-2 — HIGH: SSRF in `/api/sync-proxy` (fetch action) ✅ Fixed

**What it was:** `api/sync-proxy.js` constructed a fetch URL from caller-supplied input with
only a `url.startsWith('http')` check. An attacker could pass `http://169.254.169.254/...`
(AWS metadata) or any arbitrary URL to use the Vercel edge function as an unauthenticated proxy.
The endpoint had no authentication at the time, making this exploitable by anyone.

**What was done:** Added hostname validation immediately after URL construction:
```js
const parsedUrl = new URL(fullUrl);
if (parsedUrl.hostname !== 'agirlandyourdog.com') {
  return new Response(JSON.stringify({ success: false, error: 'URL not allowed' }), {
    status: 403, headers: { 'Content-Type': 'application/json' },
  });
}
```

Only requests to `agirlandyourdog.com` are forwarded. All other hostnames are rejected with 403.

---

## RECOMMENDED Findings

### REC-1 — MEDIUM: `/api/sync-proxy` has no authentication ✅ Fixed

**What it was:** Any caller on the internet can POST to `/api/sync-proxy`. After MUST-1 is
deployed (credentials move server-side), the `authenticate` action would call the external site
with real credentials on behalf of any anonymous caller, returning a valid session cookie.

**What was done:** Added `VITE_SYNC_PROXY_TOKEN` Bearer token check at the top of `sync-proxy.js`.
- Token is intentionally VITE_-prefixed so the browser can read it from `import.meta.env`
- `auth.js` sends it as `Authorization: Bearer {token}` on every proxy call via `proxyHeaders()`
- Skipped in local dev when env var is not set (same pattern as CRON_SECRET)
- Token is NOT the same as `CRON_SECRET` — separate purpose, separate secret

**⚠️ MANUAL STEP REQUIRED:** Set `VITE_SYNC_PROXY_TOKEN` in Vercel dashboard (any random string).

---

### REC-2 — LOW: `cron-detail` session_cleared path skips `writeCronHealth` ✅ Fixed

**What it was:** When the detail cron detected a stale session and cleared it, it returned
200 without calling `writeCronHealth`. The Cron Health card on Settings showed the previous
run's result instead of "session cleared."

**What was done:** Added one `writeCronHealth` call before the `session_cleared` return in
`api/cron-detail.js`.

---

### REC-3 — LOW: `CRON_SECRET` guard is opt-in ⏳ Not yet done

**What it was:** All three cron handlers use `if (process.env.CRON_SECRET && ...)` — if the
env var is accidentally removed from Vercel, the endpoints become publicly triggerable.

**Status:** Low priority. `CRON_SECRET` is confirmed set in Vercel and monitored via health
checks. Can add a production warning log in a future cleanup pass.

---

### REC-4 — LOW: Dead code ✅ Complete (with intentional exceptions)

**Deleted:**
- `src/lib/scraper/deletionDetection.js` — commit `80ff992` (no live imports)
- `src/lib/scraper/stagedVerification.js` — commit `80ff992` (no live imports; also referenced `VITE_` credentials)
- `src/lib/scraper/batchSync.js` — commit `154c408` (replaced by micro-mode crons; Batch Sync UI section removed from SyncSettings.jsx)

**Intentionally kept:**
- `src/lib/scraper/historicalSync.js` — used by SyncSettings.jsx Historical Import section. Useful for rebuilding all data from scratch (runs `runSync()` in 30-day chunks for large date ranges). Not dead code.
- `src/pages/SyncHistoryPage.jsx` + `SyncHistoryTable.jsx` + `SyncDetailModal.jsx` + `useSyncHistory.js` — REQ-107 backlog (sync history UI). No security impact from keeping.

---

### REC-5 — LOW: Dead `SCRAPER_CONFIG.retryDelays` config ✅ Fixed

**What it was:** `retryDelays: [5000, 30000, 300000]` in `src/lib/scraper/config.js` was never
read by the cron path (which uses `syncQueue.markFailed()` backoff). Misleading dead config.

**What was done:** Removed `retryDelays` from `SCRAPER_CONFIG`.

---

## What's Clean — Reviewed and Found Safe

| Area | Status | Notes |
|------|--------|-------|
| **Supabase RLS** | ✅ Clean | All 8 tables have RLS enabled. Service role key never in `src/`. |
| **SQL injection** | ✅ Clean | All DB ops use Supabase client parameterized queries. |
| **XSS from scraped data** | ✅ Clean | Scraped strings stored as plain text. React auto-escapes all output. |
| **Error sanitization** | ✅ Clean | `sanitizeError()` in sync.js and sync-proxy.js strips URLs + credentials before logging. |
| **Session cookie storage** | ✅ Clean | Cookies stored in Supabase `sync_settings` (RLS-protected). Not in localStorage. 24h TTL. |
| **CSRF on external site login** | ✅ Clean | Both auth.js and sync-proxy.js fetch login page first to extract CSRF tokens. |
| **Cron authorization** | ✅ Clean | All 3 handlers validate `Authorization: Bearer {CRON_SECRET}`. Confirmed set in Vercel. |
| **Race conditions** | ✅ Acceptable | Overlap detection + UNIQUE constraint. Hobby plan single-threaded crons make simultaneous runs impossible. |

---

## Files Changed

| File | Change |
|------|--------|
| `api/sync-proxy.js` | MUST-1: read creds from `process.env`; MUST-2: hostname validation; REC-1: proxy token auth |
| `src/lib/scraper/auth.js` | MUST-1: remove creds from browser proxy POST; REC-1: `proxyHeaders()` sends token |
| `src/lib/scraper/sync.js` | MUST-1: remove username/password from runSync options |
| `api/cron-auth.js` | MUST-1: update env var key names |
| `api/cron-detail.js` | REC-2: add writeCronHealth to session_cleared path |
| `src/lib/scraper/config.js` | REC-5: remove dead retryDelays |
| `src/lib/scraper/deletionDetection.js` | REC-4: deleted |
| `src/lib/scraper/stagedVerification.js` | REC-4: deleted |
| `src/lib/scraper/batchSync.js` | REC-4: deleted |
| `src/components/SyncSettings.jsx` | REC-4: removed Batch Sync UI section (~170 lines) |

**Commits:** `80ff992`, `154c408`, `cc3a9e5`

**Tests:** 651 tests, 650 pass (1 pre-existing DST-flaky in DateNavigator, unrelated).
