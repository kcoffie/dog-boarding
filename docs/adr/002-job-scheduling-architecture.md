# ADR-002: Job Scheduling Architecture

**Status:** Accepted
**Date:** 2024 (initial), revised March 2026

---

## Context

Qboard has two categories of automated jobs:

1. **Overnight sync** — scrape the external booking site and update the database. Must complete within a predictable window each night.
2. **Daytime notifications** — send WhatsApp roster images at 4am, 7am, 8:30am, and Friday 3pm PDT. Must be reliable, independently monitored, and not entangled with the sync pipeline.

The platform is Vercel Hobby plan. The scheduling question is: where should each category of job live?

---

## Vercel Hobby plan constraints

The Hobby plan has two hard limits that shape the entire architecture:

| Constraint | Impact |
|---|---|
| **10-second function timeout** | No single function can do a full sync (auth + schedule scan + detail fetches would take 30–60s) |
| **1 cron invocation per path per day** | Can't run a single endpoint more than once per day |

These constraints rule out a naive "one big cron that does everything" approach.

---

## Options considered

### Option A: Upgrade to Vercel Pro
Pro removes the timeout limit (60s functions) and allows more frequent crons. Simple — no architectural changes.

**Rejected because:** the constraints are solvable at the architecture level for free. Upgrading before trying is premature.

### Option B: All jobs on Vercel crons
Keep everything on Vercel. Work within the constraints via pipeline design.

**Partially adopted** — used for the overnight sync pipeline (see below).

### Option C: All jobs on GitHub Actions
Move everything to GH Actions, which has no timeout limit and flexible cron scheduling.

**Partially adopted** — used for notifications and monitoring jobs.

### Option D: Split by job category (adopted)
Use Vercel crons for jobs that are tightly coupled to the Vercel runtime (sync crons need to call Vercel serverless endpoints), and GitHub Actions for jobs that need more flexibility (notifications, monitoring).

---

## Decision

**Split by category: Vercel crons for sync, GitHub Actions for notifications and monitoring.**

### Sync pipeline: Vercel crons

The 10-second timeout is solved by decomposing the sync into a queue-based pipeline:

```
cron-auth      (00:00) — authenticate, cache session in DB
cron-schedule  (00:05) — scan schedule, write candidates to sync_queue
cron-detail    (00:10) — dequeue one item, fetch detail, upsert to DB
cron-detail-2  (00:15) — identical handler at a second path
```

Each stage does one unit of work and completes well within 10 seconds. The queue (`sync_queue` table) provides durability — if a detail cron fails, the item stays queued for the next night.

**The path-splitting trick for throughput:** the Hobby plan allows 1 invocation per *path* per day. `cron-detail-2.js` is a one-line re-export of `cron-detail.js` at a different path (`/api/cron-detail-2`). This gives us two detail-fetch slots per night at zero cost — effectively doubling throughput without a Pro upgrade.

### Notifications and monitoring: GitHub Actions

Notification workflows need to fire multiple times per day (4am, 7am, 8:30am, 3pm) and at specific PDT times. Vercel Hobby crons can only run once per path per day, which would require 4 separate paths — manageable, but those slots are better used for sync throughput.

GitHub Actions has no such limitation and provides:
- `workflow_dispatch` for on-demand manual triggers (critical for testing)
- Better log visibility (full run history in GitHub UI)
- Independent failure detection (a failing notify workflow sends an email, visible to the Gmail monitor)
- Natural separation from the sync pipeline — a sync failure cannot cascade to a missed notification

Monitoring jobs (integration check, cron health check, Gmail monitor) also run on GitHub Actions for the same reasons: they're independent observers of the system, and their failures should be visible via email, not buried in Vercel function logs.

### Notification timing note (DST)

GitHub Actions cron syntax is always UTC. PDT = UTC-7, PST = UTC-8. Workflows must be updated twice a year (March and November DST transitions). This is a known maintenance cost — acceptable given the other benefits.

---

## Consequences

- The overnight sync is robust within Hobby plan limits; upgrading to Pro requires zero code changes (only an env var: `SYNC_MODE=standard` enables more frequent crons if added)
- Notifications are decoupled from sync — a sync pipeline failure cannot cause a missed morning WhatsApp
- Each job category has its own failure surface, independently monitored
- GitHub Actions provides natural audit history for all scheduled job runs
- DST transitions require manual cron schedule updates (2×/year)
