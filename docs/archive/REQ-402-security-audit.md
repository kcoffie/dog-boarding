# REQ-402 Security Audit — Working Document
**Audit performed:** March 2, 2026
**Auditor:** Senior Security Engineer / Full-Stack Architect review
**Status:** Audit complete. Implementation not yet started.

When all fixes are implemented, copy this document to `docs/REQ-402-security-report-FINAL.md`,
add the completion datetime, and update each item's status to ✅ Fixed / ✅ Confirmed.

---

## Scope

Review dimensions:
1. Supabase RLS — every table has RLS enabled; service role key never in frontend
2. Scraper resilience — scraped data sanitized before DB upsert (Stored XSS)
3. Session security — external site cookies protected at rest
4. Cron/API security — CRON_SECRET strictly enforced
5. Data integrity — race condition analysis for duplicate boardings
6. Error handling — credentials never leak into sync_logs

Files reviewed: `supabase/schema.sql`, `src/lib/scraper/sessionCache.js`, `src/lib/scraper/auth.js`,
`src/lib/scraper/mapping.js`, `src/lib/scraper/sync.js`, `api/cron-auth.js`, `api/cron-schedule.js`,
`api/cron-detail.js`, `api/sync-proxy.js`, `src/lib/supabase.js`, `.env.example`

---

## MUST-FIX

---

### MUST-1 — CRITICAL: External site credentials leaked in client JS bundle

**Risk:** `VITE_EXTERNAL_SITE_USERNAME` and `VITE_EXTERNAL_SITE_PASSWORD` have the `VITE_` prefix.
Vite replaces `import.meta.env.VITE_*` **at build time**, embedding the literal credential values
in the minified JS bundle served to every visitor. Anyone who opens DevTools → Sources can read them.

**Confirmed in:**
- `src/lib/scraper/sync.js:244-245` — reads `import.meta.env?.VITE_EXTERNAL_SITE_USERNAME`
- `src/lib/scraper/stagedVerification.js:34-35` — same (dead code, but still compiled)
- `src/lib/scraper/config.js:8` — `VITE_EXTERNAL_SITE_URL` same pattern (URL is not secret, but shows the pattern)

**Root cause:** The manual "Sync Now" path calls `runSync()` → `authenticate()` in-browser,
which needs the credentials. auth.js detects browser context and routes through `/api/sync-proxy`,
passing `{ action: 'authenticate', username, password }` in the POST body. The proxy accepts
credentials from the caller instead of reading them server-side.

**Fix — 3 files + Vercel env rename:**

1. **Vercel env vars:** Rename `VITE_EXTERNAL_SITE_USERNAME` → `EXTERNAL_SITE_USERNAME`
   and `VITE_EXTERNAL_SITE_PASSWORD` → `EXTERNAL_SITE_PASSWORD` in the Vercel dashboard.
   Do NOT use VITE_ prefix on any secret that should stay server-side.

2. **`api/sync-proxy.js` — `authenticate` action:** Stop accepting `username`/`password` from
   the request body. Read them from `process.env.EXTERNAL_SITE_USERNAME` / `EXTERNAL_SITE_PASSWORD`.
   The browser never needs to know the credentials — the proxy is already server-side.
   ```js
   // Before (insecure):
   const { action, username, password, url, cookies, method } = body;
   if (!username || !password) { return 400 error }

   // After (secure):
   const { action, url, cookies, method } = body;
   const username = process.env.EXTERNAL_SITE_USERNAME;
   const password = process.env.EXTERNAL_SITE_PASSWORD;
   if (!username || !password) { return 500 error "Server credentials not configured" }
   ```

3. **`src/lib/scraper/auth.js` — browser path:** Remove `username`/`password` from the proxy
   POST body in the browser `authenticate()` call. The proxy now handles it server-side.

4. **`src/lib/scraper/sync.js` — `runSync()`:** Remove `username` and `password` from the
   options destructure (lines 243–245). They're no longer needed by the browser.

5. **`api/cron-auth.js`:** Already reads `process.env.VITE_EXTERNAL_SITE_USERNAME`. Update
   key name to `process.env.EXTERNAL_SITE_USERNAME` after Vercel rename.

**Verify after fix:** Build the app (`npm run build`), then search `dist/` for any fragment
of the real password to confirm it's not in the bundle.

---

### MUST-2 — HIGH: SSRF in `/api/sync-proxy` (fetch action)

**Risk:** `api/sync-proxy.js:181`:
```js
const fullUrl = url.startsWith('http') ? url : `${EXTERNAL_BASE_URL}${url}`;
await fetch(fullUrl, ...)
```
If `url` is `http://169.254.169.254/latest/meta-data/` (AWS/GCP metadata) or any other URL,
the Vercel edge function fetches it. The endpoint has no authentication (see RECOMMENDED-1),
so anyone on the internet can use your server as an unauthenticated proxy.

**Fix — add hostname validation before fetch:**
```js
const fullUrl = url.startsWith('http') ? url : `${EXTERNAL_BASE_URL}${url}`;
const parsedUrl = new URL(fullUrl);
if (parsedUrl.hostname !== 'agirlandyourdog.com') {
  return new Response(JSON.stringify({ success: false, error: 'URL not allowed' }), {
    status: 403, headers: { 'Content-Type': 'application/json' },
  });
}
```

---

## RECOMMENDED

---

### REC-1 — MEDIUM: `/api/sync-proxy` has no authentication

**Risk:** Anyone can POST to this endpoint. After MUST-1 is fixed (credentials move server-side),
the `authenticate` action will authenticate against the external site using your real credentials
for any caller — effectively handing out valid session cookies to anyone who asks.

**Fix:** Add the same `CRON_SECRET` Bearer check used by the cron handlers:
```js
const auth = request.headers.get('authorization');
if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```
Note: The browser path (manual Sync Now) calls this proxy. After adding auth, the browser
must send the token. One approach: store `CRON_SECRET` as a `VITE_SYNC_PROXY_TOKEN` (public
client token specifically for proxy auth — different from the cron secret itself). Or create
a separate `SYNC_PROXY_SECRET` env var.

Alternatively, if the manual sync path is moved to also go through the cron infrastructure
(browser triggers cron-schedule + cron-detail via API instead of running sync.js in-browser),
the proxy only needs to be called by internal cron flows and can require `CRON_SECRET`.

---

### REC-2 — LOW: `cron-detail` `session_cleared` path skips `writeCronHealth`

**Risk:** Observability gap only — no security impact.

`api/cron-detail.js:103-110`: when the server rejects stale session cookies, the code clears
the session and returns 200 without calling `writeCronHealth`. The Cron Health card on Settings
shows the previous run result instead of "session cleared."

**Fix:** Add one call before return:
```js
await writeCronHealth(supabase, 'detail', 'success', { action: 'session_cleared' }, null);
return res.status(200).json({ ok: true, action: 'session_cleared', reason: 'session_expired' });
```

---

### REC-3 — LOW: `CRON_SECRET` guard is opt-in rather than opt-out

**Risk:** If `CRON_SECRET` env var is accidentally removed from Vercel, all three cron endpoints
become publicly triggerable with no auth. Currently low risk because the key is confirmed set.

**Current guard (all 3 cron handlers):**
```js
if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) { ... }
```

**Hardening option:** Add a warning log when CRON_SECRET is absent and not in local dev:
```js
if (!process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[CronAuth] ⚠️ CRON_SECRET is not set — endpoint is unprotected');
}
```

---

### REC-4 — LOW: Dead code (8 files, confirmed no imports)

These files are unused since micro-mode crons replaced the full sync architecture.
Remove them to reduce confusion and attack surface.

```
src/lib/scraper/batchSync.js
src/lib/scraper/historicalSync.js
src/lib/scraper/deletionDetection.js
src/lib/scraper/stagedVerification.js   ← also references VITE_ credentials directly
src/pages/SyncHistoryPage.jsx
src/components/SyncHistoryTable.jsx
src/components/SyncDetailModal.jsx
src/hooks/useSyncHistory.js
```

Before deleting: run `grep -r "batchSync\|historicalSync\|deletionDetection\|stagedVerification\|SyncHistoryPage\|SyncHistoryTable\|SyncDetailModal\|useSyncHistory" src/ api/` to confirm no live imports.

---

### REC-5 — INFO: Config/implementation drift

`src/lib/scraper/config.js`:
```js
retryDelays: [5000, 30000, 300000], // 5s, 30s, 5min
```
This array is not used in the cron path. `cron-detail` delegates retry timing to `syncQueue.markFailed()`,
which has its own hardcoded backoff (+5min, +10min). The config value is dead and misleading.

**Fix:** Remove `retryDelays` from `SCRAPER_CONFIG`, or update the comment to say it applies
only to the legacy `runSync()` path (not micro-mode crons).

---

## What's Clean — No Action Needed

| Area | Status | Notes |
|------|--------|-------|
| **Supabase RLS** | ✅ Clean | All 8 tables have RLS enabled. Policies grant all authenticated users full access — intentional for single-tenant shared model. |
| **Service role key isolation** | ✅ Clean | `grep` confirmed `SUPABASE_SERVICE_ROLE_KEY` / `service_role` appear in `api/` only, never in `src/`. |
| **SQL injection** | ✅ Clean | All DB operations use Supabase client parameterized queries. |
| **XSS from scraped data** | ✅ Clean | Scraped strings (dog names, notes, prices) stored as plain text data. React auto-escapes all rendered output. No server-side HTML generation from this data. |
| **Error sanitization** | ✅ Clean | `sync.js` `sanitizeError()` strips URLs and credential patterns before writing to `sync_logs`. `sync-proxy.js` has equivalent `sanitizeError()`. |
| **Session cookie storage** | ✅ Clean | Cookies stored in `sync_settings` table (Supabase, RLS-protected). 24h TTL enforced at retrieval. Not stored in localStorage or client-accessible state. |
| **CSRF on external site login** | ✅ Clean | `auth.js` and `sync-proxy.js` both fetch the login page first to extract hidden form fields (nonce/token) before submitting credentials. |
| **Credential exposure in logs** | ✅ Clean | `username`/`password` are function parameters, not console.logged. Error messages sanitized before storage. |
| **Cron authorization (when CRON_SECRET set)** | ✅ Clean | All 3 handlers validate `Authorization: Bearer {CRON_SECRET}`. Confirmed set in Vercel. |
| **supabase.js (client init)** | ✅ Clean | Uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — both are intentionally public (Supabase anon key is designed to be public, RLS enforces access). |
| **Race conditions (duplicate boardings)** | ✅ Acceptable | `upsertBoarding()` uses overlap detection + external_id UNIQUE constraint. Hobby plan's single-threaded daily crons make simultaneous runs impossible in practice. |
| **Stuck sync detection** | ✅ Clean | `abortStuckSync()` in `sync.js`, `resetStuck()` in `cron-detail` — both detect and recover from orphaned running states. |

---

## Implementation Order

1. **MUST-1** — Credential fix (Vercel rename + 3 file changes) — highest risk, do first
2. **MUST-2** — SSRF hostname validation (3 lines) — do immediately after, natural follow-on in same PR
3. **REC-1** — sync-proxy auth — design the auth approach first (browser needs a way to authenticate to proxy)
4. **REC-2** — cron-detail health write (1 line) — trivial, include in any open PR
5. **REC-4** — dead code removal — separate PR, clean up after security work
6. **REC-3, REC-5** — low priority, any time

## Final Report Deliverable

When all fixes are implemented, create `docs/REQ-402-security-report-FINAL.md` containing:
- Completion datetime
- Each finding with: what it was, why it mattered, what was done to fix it
- Each "clean" area with: what was looked for and why it's safe
- Summary of files changed and tests run
