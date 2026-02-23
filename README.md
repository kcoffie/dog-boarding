# Qboard - Dog Boarding Manager

A web application for managing dog boarding businesses. Track bookings, sync appointments from your external booking system, calculate revenue, manage employee payroll, and more.

## Features

- **Boarding Matrix** — Daily breakdown of dogs, rates, and overnight revenue
- **Visual Calendar** — See all bookings at a glance
- **Dog Management** — Track dogs with custom day/night rates
- **Employee Tracking** — Assign employees to overnight shifts, calculate earnings
- **Payroll** — Track and manage employee payments with payment history
- **CSV Import** — Bulk import bookings from spreadsheets
- **External Sync** — Automatically sync appointments from agirlandyourdog.com
- **Secure Access** — Invite-only signup, all users share one organization

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Hosting:** Vercel (frontend + serverless API + cron jobs)
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
git clone https://github.com/yourusername/dog-boarding.git
cd dog-boarding
npm install
cp .env.example .env.local
# Edit .env.local with your credentials (see Environment Variables below)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the SQL from `supabase/schema.sql` in the Supabase SQL editor
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
| `VITE_EXTERNAL_SITE_USERNAME` | Login email for agirlandyourdog.com |
| `VITE_EXTERNAL_SITE_PASSWORD` | Login password for agirlandyourdog.com |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only — bypasses RLS) |

Set all variables in `.env.local` for local development and in your Vercel project dashboard for production.

---

## External Sync

Qboard can automatically pull boarding appointments from [agirlandyourdog.com](https://agirlandyourdog.com) into the database. Appointments are deduplicated by external ID, and only overnight boarding appointments are imported (daycare, pack groups, and evaluations are filtered out).

### Manual Sync

Go to **Settings → External Sync** in the app. Set a date range (defaults to today + 60 days) and click **Sync Now**. A **Full sync** link is also available to scan the complete schedule without a date filter.

### Automated Sync (Vercel Cron Jobs)

Three cron jobs run daily on the Vercel Hobby plan:

| Cron | Schedule (UTC) | Purpose |
|---|---|---|
| `cron-auth` | 0:00 AM | Re-authenticate and cache session in DB |
| `cron-schedule` | 0:05 AM | Scan schedule pages, queue new boarding candidates |
| `cron-detail` | 0:10 AM | Fetch detail page for one queued appointment |

On the Vercel **Pro plan**, crons can run more frequently (every 5–60 min). See the JSDoc header in each `api/cron-*.js` file for the upgrade path — no code changes required, only a `SYNC_MODE=standard` env var.

### Sync Architecture

```
cron-auth      → authenticates with external site, caches session cookies in DB
cron-schedule  → reads session from DB, scans schedule pages, writes candidates to sync_queue
cron-detail    → reads session from DB, fetches one queued appointment detail, upserts to DB
```

Session caching is key: authentication costs ~4.5s per call. By caching cookies in `sync_settings`, `cron-schedule` and `cron-detail` skip auth entirely and stay well within Vercel's 10-second function timeout.

### Amended Appointment Reconciliation

When a booking is amended on the external site, the old appointment URL becomes inaccessible (the site serves the schedule page instead). Qboard detects this during manual syncs by checking for the absence of `data-start_scheduled` in the response HTML, and automatically archives the old record so it doesn't appear as an active boarding.

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
    └── scraper/      # External sync modules
        ├── auth.js          # Authentication with external site
        ├── schedule.js      # Schedule page parsing and pagination
        ├── extraction.js    # Appointment detail extraction
        ├── sync.js          # Main sync orchestrator
        ├── mapping.js       # Maps scraped data to DB schema
        ├── reconcile.js     # Detects and archives amended appointments
        ├── sessionCache.js  # Session cookie caching in DB
        └── syncQueue.js     # Queue management for cron detail processing

api/
├── sync-proxy.js    # Vercel Edge Function — CORS proxy for browser→external site
├── cron-auth.js     # Cron: refresh session
├── cron-schedule.js # Cron: scan schedule pages, enqueue candidates
└── cron-detail.js   # Cron: process one queued appointment

supabase/
└── schema.sql       # Full DB schema including sync tables
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
