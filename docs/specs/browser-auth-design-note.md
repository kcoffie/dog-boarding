# Design note: take the proxy token out of the browser (#301)

**Problem.** `VITE_SYNC_PROXY_TOKEN` is read by browser code, so Vite inlines it into the public JavaScript bundle at qboarding.vercel.app. The same token is the only guard on:
- `/api/sync-proxy`, which logs into the booking site with the stored credentials and fetches pages for the caller;
- `/api/send-question` (Telegram to Kate);
- `/api/run-sync`;
- `/api/notify` and `/api/notify-intraday` (send the roster);
- `/api/roster-image` and `/api/intraday-image` (client and dog names).

`sync-proxy` and `send-question` also **fail open**: with the env var unset, they accept anyone. So anyone who opens the site can read client data from the booking site and the roster, and trigger sends. The old value has to be treated as public forever: bundles are cached, and the repo is public.

**Options.**
1. **The browser proves a logged-in user; jobs keep a server-only token.** The two browser callers (`Layout.jsx` → send-question, `scraper/auth.js` → sync-proxy) send the user's Supabase access token (`supabase.auth.getSession()`). Those endpoints verify it with `supabase.auth.getUser(jwt)`. The app is invite-only, so any signed-in user is allowed. With no browser code referencing `VITE_SYNC_PROXY_TOKEN`, Vite stops bundling it, and Kate rotates its value.
2. Same as 1, plus renaming the server token to `INTERNAL_API_TOKEN` (no `VITE_` prefix), so it can never be bundled by accident. It's clearer, but it means one more secret change across Vercel, GitHub and `.env.local`, and touches every workflow.
3. Per-endpoint secrets. Over-built for one operator.

**Choice: 1, plus a CI guard.**
- The Lint job fails if any non-test file under `src/` references `VITE_SYNC_PROXY_TOKEN`. That's a step in CI, not a vitest test (no git in vitest).
- Every token check fails closed: unset means 500 "Server misconfigured", never "skip".
- The rename (option 2) is a cheap follow-up if Kate wants it, but isn't needed for safety once the guard exists.

**What changes.**
- `send-question` and `sync-proxy` accept only a valid Supabase user JWT. The old token is rejected there, because the browser was its only legitimate caller.
- `run-sync`, `notify`, `notify-intraday`, `roster-image` and `intraday-image` keep the server token (GitHub Actions, ops-watch, notify → image). Nothing in the browser calls them.
- **Rotation (Kate, after the deploy, in the evening):**
  - Generate a value (`openssl rand -hex 32`).
  - Set `VITE_SYNC_PROXY_TOKEN` in Vercel (Production, type Sensitive).
  - Set the same value in the GitHub secret of the same name, and in `.env.local`.
  - Redeploy.
  - Between the Vercel and GitHub updates, a notify run gets 401 and goes red. That's loud and harmless in the evening.

**What breaks.**
- A signed-out browser can't use Send a Question or manual sync. It shouldn't anyway.
- A Supabase auth outage blocks both. The jobs are unaffected.
- `getUser(jwt)` is one network call per request. These are rare, human-triggered calls.

**Threat.**
- After rotation, the bundle holds no secret.
- The Supabase anon key stays public by design (RLS).
- A stolen user session can still send a question or run a proxy fetch until it expires, which is the same as any web app.
- The proxy already rejects any host other than the booking site (`sync-proxy.js:201`), so the exposure is the booking site's pages, not arbitrary fetches.

**How we'll know it's working.**
- `grep -c <old token prefix>` in the deployed JS bundle returns 0.
- Send a Question works signed in and returns 401 signed out.
- Manual sync works.
- The roster jobs succeed after rotation.

**How we'll know it isn't.**
- The notify runs go red on 401. GitHub emails Kate, and ops-watch reports the missing roster.

---

## Architect review (2026-10-20): verdict "rethink", then build with these changes

**Kate's decisions and actions (2026-10-20):**
- Supabase sign-up is **off** (`disable_signup: true`, verified via `/auth/v1/settings`).
- The user list was checked: no strangers.
- Vercel Deployment Protection is Standard.
- New staff accounts are added by Kate in Supabase (Authentication → Users → Invite). **The invite-code signup page goes away** in this change.
- The one client surname left in git history stays (no new rewrite).

**Changes to build (they replace "Choice: 1, plus a CI guard" above):**
1. **Rename the server token to `INTERNAL_API_TOKEN`** (no `VITE_` prefix, so Vite can never bundle it) and drop the CI grep guard. Every server-to-server caller uses it: the notify workflows, notify-intraday, roster-image, intraday-image, ops-watch → roster-image, and check-deploy (`.env.local`).
2. **Browser → `send-question` and `sync-proxy`: a Supabase user JWT.** Use one shared fail-closed helper for both runtimes (sync-proxy is **edge**, send-question is nodejs): `GET ${VITE_SUPABASE_URL}/auth/v1/user` with `apikey: <anon>` and `Authorization: Bearer <jwt>`, plus a timeout.
   - Missing env → 500.
   - Error, timeout or non-200 → 401 (or 503 for an outage), **never a pass**.
3. **`src/lib/scraper/auth.js` is also imported on the server** (cron-auth, run-sync). Get the JWT only inside `isBrowser()`, with a dynamic `await import('../supabase.js')` (`supabase.js` throws at load without `import.meta.env`). Call `getSession()` on every request, because it refreshes expired tokens during long historical syncs. Add a test that imports `api/cron-auth.js` under plain Node.
4. `send-question` takes the sender from the verified user's email, not from the request body.
5. `sync-proxy`: allow only `method: GET`. Its `authenticate` action returns the operator's booking-site session cookies, which is what the leaked token exposed.
6. Delete `api/run-sync.js`. Nothing calls it, and it's a token-guarded "full production sync" trigger.
7. Remove the invite-code signup page and route. The `invite_codes` table can stay.
8. **Rotation order (Kate does it in the evening, after the code is merged and live). It's built so the 4am roster never hits a 401:**
   1. Add `INTERNAL_API_TOKEN` (new value from `openssl rand -hex 32`) in **Vercel** (Production, Sensitive), **GitHub secrets** and **`.env.local`** before merging. The code reads only the new name, so all three must exist first (`check:deploy` reads it from `.env.local` in step 2). Keep the old `VITE_SYNC_PROXY_TOKEN` everywhere until step 5.
   2. Merge. `npm run check:deploy`.
   3. `curl` `/api/roster-image?type=weekend&token=NEW` → 200, and the old `VITE_SYNC_PROXY_TOKEN` value → 401.
   4. Dispatch `notify-intraday.yml` → 200 `channel_telegram` (proves the workflow secret without sending).
   5. Delete `VITE_SYNC_PROXY_TOKEN` from Vercel, GitHub and `.env.local`. No redeploy is needed: no code reads it, and a local build with it set (2026-10-20) bundled neither the old nor the new value.
9. **Check it worked:** neither the old nor the new value appears anywhere in the deployed JS (`curl` the bundle and grep). Send a Question works signed in, and gets 401 signed out. Manual sync works.

**Keep this branch local until it's merged.** The design note describes how the still-valid public token can be abused; push it only together with the fix and rotate right after.
