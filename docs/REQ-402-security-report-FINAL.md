# REQ-402 Security Report — FINAL
**Completed:** March 2, 2026
**Scope:** Full security audit + implementation of all MUST-FIX and most RECOMMENDED findings.

---

## Summary

Security audit performed March 2, 2026. All MUST-FIX issues resolved in commit `80ff992`.
REC-1 (proxy auth) is deferred pending design decision (see below).
REC-3 (CRON_SECRET warning) is low priority / informational.
REC-4 (dead code removal) is partially complete — 2 of 8 files deleted; remaining 6 require
UX decision from Kate before removing batch sync / historical import UI from Settings page.

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

### REC-1 — MEDIUM: `/api/sync-proxy` has no authentication ⏳ Deferred

**What it was:** Any caller on the internet can POST to `/api/sync-proxy`. After MUST-1 is
deployed (credentials move server-side), the `authenticate` action will call the external site
with real credentials on behalf of any anonymous caller, returning a valid session cookie.

**Design options considered:**
- **Option A:** `VITE_SYNC_PROXY_TOKEN` — a public client token (different from `CRON_SECRET`)
  stored as a VITE_ env var. Browser sends it as Bearer. Proxy validates it. Limits exposure to
  callers who know the token (anyone who reads the bundle).
- **Option B:** Move "Sync Now" to trigger the cron endpoints via API instead of calling
  `runSync()` in-browser. Then the proxy is only called from internal cron flows which already
  use `CRON_SECRET`.

**Status:** Deferred — requires Kate's decision on approach. MUST-2 (hostname check) reduces
practical SSRF risk significantly in the meantime.

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

### REC-4 — LOW: Dead code (8 files) ⚠️ Partially complete

**Deleted (no live imports):**
- `src/lib/scraper/deletionDetection.js` — deleted in commit `80ff992`
- `src/lib/scraper/stagedVerification.js` — deleted in commit `80ff992` (also referenced `VITE_` credentials directly)

**Remaining — requires UX decision:**
The following 6 files are still imported from live code:
- `src/lib/scraper/batchSync.js` — imported by `SyncSettings.jsx` (Batch Sync collapsible section)
- `src/lib/scraper/historicalSync.js` — imported by `SyncSettings.jsx` (Historical Import section)
- `src/pages/SyncHistoryPage.jsx` — live route in `App.jsx` at `/sync-history`
- `src/components/SyncHistoryTable.jsx` — used by SyncHistoryPage
- `src/components/SyncDetailModal.jsx` — used by SyncHistoryPage
- `src/hooks/useSyncHistory.js` — used by SyncHistoryPage

Removing these requires removing the Batch Sync + Historical Import UI sections from Settings
(~200 lines) and the `/sync-history` route from App.jsx. Pending Kate's approval.

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
| `api/sync-proxy.js` | MUST-1: read creds from `process.env`; MUST-2: hostname validation |
| `src/lib/scraper/auth.js` | MUST-1: remove creds from browser proxy POST; restructure to check isBrowser first |
| `src/lib/scraper/sync.js` | MUST-1: remove username/password from runSync options |
| `api/cron-auth.js` | MUST-1: update env var key names |
| `api/cron-detail.js` | REC-2: add writeCronHealth to session_cleared path |
| `src/lib/scraper/config.js` | REC-5: remove dead retryDelays |
| `src/lib/scraper/deletionDetection.js` | REC-4: deleted |
| `src/lib/scraper/stagedVerification.js` | REC-4: deleted |

**Commit:** `80ff992` — feat: REQ-402 security hardening

**Tests:** 651 tests, 650 pass (1 pre-existing DST-flaky in DateNavigator, unrelated).
