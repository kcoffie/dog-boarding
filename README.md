# Qboard — Dog Boarding Manager

**Live app:** [qboarding.vercel.app](https://qboarding.vercel.app)

A web application for managing a dog boarding business. Track bookings, sync appointments from your external booking system, view boarding intake forms, calculate revenue, manage employee payroll, and more.

## Features

- **Boarding Matrix** — Daily breakdown of dogs in house, rates, and overnight revenue
- **Visual Calendar** — See all bookings at a glance; print or export to PDF
- **Dog Management** — Track dogs with custom day/night rates
- **Boarding Forms** — Automatically fetch and display client intake forms; flag missing or date-mismatched forms
- **Employee Tracking** — Assign employees to overnight shifts, calculate earnings
- **Payroll** — Track and manage employee payments with payment history
- **CSV Import** — Bulk import bookings from spreadsheets
- **External Sync** — Automatically sync appointments from agirlandyourdog.com via scheduled cron jobs
- **Daytime Activity Intelligence** — Ingest all DC/PG appointments from the schedule; track per-worker rosters with day-over-day diff (added/removed dogs)
- **Daily Roster Image** — Generate a branded PNG of each worker's dogs; delivered via WhatsApp at 4am, 7am, and 8:30am PDT
- **Cron Health Monitoring** — Settings page shows last run time and status of each cron job
- **Secure Access** — Invite-only signup, all users share one organization

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Hosting:** Vercel (frontend + serverless API + cron jobs)
- **Notifications:** Twilio WhatsApp API
- **Scheduling:** GitHub Actions (notify delivery windows)
- **Testing:** Vitest, React Testing Library

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Supabase account (free tier works)
- Vercel account (for deployment and cron jobs)

### Installation

```bash
git clone https://github.com/kcoffie/dog-boarding.git
cd dog-boarding
npm install
cp .env.example .env.local
# Edit .env.local with your credentials (see Environment Variables below)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Run migrations from `supabase/migrations/` in order using the Supabase SQL editor
3. Copy your project URL and keys to `.env.local`

---

## Environment Variables

### Required (all environments)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key (browser-safe) |

### Required for External Sync

| Variable | Description |
|---|---|
| `EXTERNAL_SITE_USERNAME` | Login email for agirlandyourdog.com (server-side only — no `VITE_` prefix) |
| `EXTERNAL_SITE_PASSWORD` | Login password for agirlandyourdog.com (server-side only — no `VITE_` prefix) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only — bypasses RLS) |
| `VITE_SYNC_PROXY_TOKEN` | Bearer token for sync-proxy, roster-image, and notify authentication (set to any random string) |
| `CRON_SECRET` | Secret header value Vercel sends with cron requests (optional but recommended in production) |

### Required for WhatsApp Notifications

| Variable | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio WhatsApp sender number (e.g. `whatsapp:+14155238886`) |
| `NOTIFY_RECIPIENTS` | Comma-separated recipient numbers (e.g. `+18005551234,+18005555678`) |

Set all variables in `.env.local` for local development and in your Vercel project dashboard for production. Also set `VITE_SYNC_PROXY_TOKEN` as a GitHub Actions secret (used by the notify workflows).

> **Important:** `EXTERNAL_SITE_USERNAME` and `EXTERNAL_SITE_PASSWORD` must NOT use the `VITE_` prefix — Vite bakes `VITE_*` variables into the browser bundle, which would expose credentials publicly.

---

## External Sync

Qboard automatically pulls boarding appointments from [agirlandyourdog.com](https://agirlandyourdog.com) into the database. Appointments are deduplicated by external ID, and only overnight boarding appointments are imported (daycare, pack groups, and evaluations are filtered out).

### Manual Sync

Go to **Settings → External Sync** in the app. Set a date range (defaults to today + 60 days) and click **Sync Now**. A **Full sync** link is also available to scan the complete schedule without a date filter.

### Automated Sync (Vercel Cron Jobs)

Three cron jobs run daily on the Vercel Hobby plan:

| Cron | Schedule (UTC) | Purpose |
|---|---|---|
| `cron-auth` | 0:00 AM | Re-authenticate and cache session in DB |
| `cron-schedule` | 0:05 AM | Scan schedule pages, queue new boarding candidates |
| `cron-detail` | 0:10 AM | Fetch detail page for one queued appointment or boarding form |

On the Vercel **Pro plan**, crons can run more frequently (every 5–60 min). See the JSDoc header in each `api/cron-*.js` file for the upgrade path — no code changes required, only a `SYNC_MODE=standard` env var.

### Sync Architecture

```
cron-auth      → authenticates with external site, caches session cookies in DB
cron-schedule  → reads session from DB, scans schedule pages, writes candidates to sync_queue
cron-detail    → reads session from DB, fetches one queued appointment or boarding form
```

Session caching is key: authentication costs ~4.5s per call. By caching cookies in `sync_settings`, `cron-schedule` and `cron-detail` skip auth entirely and stay well within Vercel's 10-second function timeout.

### Boarding Forms

After each sync, boarding intake forms are automatically fetched from the external site for upcoming boardings. Forms are matched to boardings using a 7-day submission window (submitted within 7 days before arrival). The Boarding Matrix highlights dogs with missing or empty forms.

### Amended Appointment Reconciliation

When a booking is amended on the external site, the old appointment URL becomes inaccessible. Qboard detects this during manual syncs and automatically archives the old record so it doesn't appear as an active boarding.

---

## WhatsApp Notifications

Qboard sends a daily roster image to a WhatsApp number via Twilio at three delivery windows: **4am**, **7am**, and **8:30am PDT**. Each message contains a branded PNG showing every worker's dogs for the day with a day-over-day diff (green `+` for newly added dogs, red strikethrough for removed dogs).

On Fridays, a fourth message is sent in the afternoon with a **weekend boarding preview** — who is arriving and departing Saturday–Sunday, with check-in/out times and night counts.

### How it works

1. A GitHub Actions workflow fires at each delivery window and calls `GET /api/notify?window=4am` (or `7am`/`830am`/`friday-pm`)
2. `notify.js` refreshes the daytime schedule from the external site, then calls `/api/roster-image` to generate the PNG
3. The image is sent to all numbers in `NOTIFY_RECIPIENTS` via the Twilio WhatsApp API
4. A hash of the roster data is stored in the `cron_health` table — if nothing changed since the last send, the 7am and 8:30am windows skip the send to avoid duplicate messages
5. The Friday PM workflow calls the same endpoint with `window=friday-pm`, which generates a weekend-themed image (arrivals + departures for Sat–Sun) and always sends regardless of hash

### GitHub Actions schedules (PDT, UTC-7)

| Workflow | UTC cron | PDT time | Days |
|---|---|---|---|
| `notify-4am.yml` | `0 11 * * 1-5` | 4:00 AM | Mon–Fri |
| `notify-7am.yml` | `0 14 * * 1-5` | 7:00 AM | Mon–Fri |
| `notify-830am.yml` | `30 15 * * 1-5` | 8:30 AM | Mon–Fri |
| `notify-friday-pm.yml` | `0 22 * * 5` | 3:00 PM | Fri only |

> Note: cron schedules shift by 1 hour when DST ends (PDT → PST, UTC-8). Update the workflows in November.

---

## Integration Check

An automated integration check runs independently of the sync pipeline to verify that what Qboard has in its database matches what's actually on the external booking site.

### What it does

1. Loads session cookies from the DB (same cache the crons use)
2. Renders the schedule page in a headless Chromium browser (via Playwright), extracts all boarding and DC/PG appointment IDs from the live DOM
3. Queries the DB for boardings overlapping the past 7 days through today+7d, and daytime appointments for today
4. Compares: flags boarding IDs visible on the schedule but missing from DB; flags daytime events missing from DB
5. Sends a WhatsApp text report to `INTEGRATION_CHECK_RECIPIENTS`

The check uses two independent signal paths (Playwright DOM + DB query) to catch bugs the sync pipeline cannot catch about itself.

### Schedule

Runs 3× daily (1am, 9am, 5pm PDT) via `integration-check.yml`, and on demand via `workflow_dispatch`.

### Required secrets (GitHub Actions)

`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `INTEGRATION_CHECK_RECIPIENTS`, `APP_URL`, `VITE_SYNC_PROXY_TOKEN`

### Manual test

```bash
curl "https://qboarding.vercel.app/api/notify?window=4am&token=YOUR_TOKEN&date=YYYY-MM-DD"
```

---

## Development

```bash
npm run dev          # Start development server (localhost:5173)
npm test             # Run test suite
npm run test:coverage # Run tests with coverage report
npm run build        # Production build
npm run lint         # ESLint
```

### Running Cron Jobs Locally

```bash
# Start the local dev server first
npx vercel dev

# Then in another terminal
curl http://localhost:3000/api/cron-auth
curl http://localhost:3000/api/cron-schedule
curl http://localhost:3000/api/cron-detail
```

The `CRON_SECRET` check is skipped when the env var is not set, so local testing works without it.

---

## Project Structure

```
src/
├── components/       # Reusable UI components
├── pages/            # Page components (routed)
├── hooks/            # Custom React hooks (Supabase data)
├── utils/            # Utility functions (date, calculations, etc.)
├── context/          # React contexts
└── lib/
    ├── pictureOfDay.js      # Daily roster data: DC/PG diff, boarders, workers
    ├── notifyWhatsApp.js    # Twilio wrapper (sendRosterImage)
    └── scraper/             # External sync modules
        ├── auth.js              # Authentication with external site
        ├── schedule.js          # Schedule page parsing and pagination
        ├── daytimeSchedule.js   # DC/PG/Boarding ingest for daytime_appointments
        ├── extraction.js        # Appointment detail extraction
        ├── sync.js              # Main sync orchestrator
        ├── mapping.js           # Maps scraped data to DB schema
        ├── forms.js             # Boarding form fetch + parse pipeline
        ├── reconcile.js         # Detects and archives amended appointments
        ├── sessionCache.js      # Session cookie caching in DB
        └── syncQueue.js         # Queue management for cron detail processing

api/
├── sync-proxy.js    # Vercel Edge Function — CORS proxy for browser→external site
├── cron-auth.js     # Cron: refresh session
├── cron-schedule.js # Cron: scan schedule pages, enqueue candidates
├── cron-detail.js   # Cron: process one queued appointment or boarding form (00:10 UTC)
├── cron-detail-2.js # Cron: second detail processor, runs in parallel (00:15 UTC)
├── roster-image.js  # Generate daily roster PNG (satori + resvg, token-gated)
└── notify.js        # WhatsApp notification orchestrator (window-gated; 4am/7am/830am/friday-pm)

.github/workflows/
├── notify-4am.yml        # GitHub Actions: call /api/notify at 4am PDT (Mon–Fri)
├── notify-7am.yml        # GitHub Actions: call /api/notify at 7am PDT (Mon–Fri)
├── notify-830am.yml      # GitHub Actions: call /api/notify at 8:30am PDT (Mon–Fri)
├── notify-friday-pm.yml  # GitHub Actions: weekend boarding preview at 3pm PDT (Fri)
└── integration-check.yml # GitHub Actions: DB vs live schedule check 3×/day

scripts/
└── integration-check.js  # Integration check script (Playwright + Supabase + Twilio)

supabase/
└── migrations/      # Numbered SQL migrations (apply in order)
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
