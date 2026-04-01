# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/) conventions.

For full release notes see [GitHub Releases](https://github.com/kcoffie/dog-boarding/releases).

---

## [5.3.0] — 2026-03-25

**Meta Template Newline Fix**

- Fixed error 132018: Meta template body parameters reject newlines. `sendTextMessage` now sanitizes at the API boundary — splits on newline, trims, drops empties, rejoins with ` | `.

## [5.2.0] — 2026-03-25

**Meta Template Locale Fix**

- Fixed error 132001: corrected `en_US` → `en` locale in all Meta template message sends. Templates were approved under language `en` but code was sending `en_US`, causing silent send failures for all alert types.

## [5.1.0] — 2026-03-24

**Twilio Removed — All Alerts via Meta Cloud API**

- Migrated integration check, cron health, and Gmail monitor from Twilio to Meta Cloud API — the same sender already used for roster image notifications since v5.0.
- `twilio` npm package removed.

## [5.0.0] — 2026-03-20

**Infrastructure Monitoring**

> Architectural milestone: replaced Twilio with Meta Cloud API for all WhatsApp sends; added three independent monitoring layers (cron health, integration correctness, Gmail infrastructure).

- **M0** — Meta Cloud API: rewrote `notifyWhatsApp.js`; `sendRosterImage` and `sendTextMessage` now use Meta Cloud API directly.
- **M1-1** — Cron health alerting: `cron-health-check.yml` GH Actions workflow fires at 00:30 UTC; alerts on consecutive failures, hung jobs (`started` > 20 min), and surfaced error messages.
- **M1-2** — `refreshDaytimeSchedule` extracted to `notifyHelpers.js` for testability; 7 exit paths covered by unit tests.
- **M2** — Gmail infrastructure monitor: hourly GH Actions workflow polls Gmail via OAuth2, deduplicates via `gmail_processed_emails` table, and alerts on new infrastructure emails.

## [4.4.3] — 2026-03-20

**Integration Check Sync-Before-Compare**

- `syncRunner.js` — new shared module; `cron-schedule.js` and `cron-detail.js` become thin wrappers with no behavior change.
- Step 0 added to integration check: runs schedule sync and drains the detail queue (up to 20 items) before Playwright comparison, eliminating false-positive "Missing from DB" alerts for bookings made after midnight but before the 1am check.

## [4.4.2] — 2026-03-20

**v4 Polish**

- Fixed Monday UTC bug: notify send-gate now uses `Intl.DateTimeFormat` for Pacific time (Vercel runs UTC; Sunday 4pm+ Pacific was incorrectly triggering the Monday skip).
- Renamed `window` → `sendWindow` in `shouldSendNotification` to avoid shadowing the browser global.
- Dev dependency audit: 7 vulnerabilities resolved.

## [4.4.1] — 2026-03-19

**Session Self-Healing**

- `ensureSession()` added to `sessionCache.js`: returns cached session if valid, re-authenticates on miss or expiry. Eliminates "No cached session" failures at the 4am/7am/8:30am notify windows.
- `cron_health_log` append-only table for persistent cron run history (migration 021).

## [4.4.0] — 2026-03-17

**Friday PM Weekend Notify**

- Every Friday at 3pm PDT, a WhatsApp roster image arrives showing dogs arriving and departing over the weekend.
- `notify-friday-pm.yml` GH Actions workflow; `friday-pm` window in `notify.js`; `type=weekend` path in `roster-image.js`.

## [4.3.0] — 2026-03-17

**Reliability & Autonomous Sync**

> Architectural milestone: Vercel Hobby path-splitting doubles nightly sync throughput at zero cost.

- `cron-detail-2.js` — second Vercel cron path re-exporting the detail handler; two paths = two appointments processed per night under Hobby plan limits.
- Cron schedule expanded to 3 pages: current week, next week, and a rotating cursor (weeks 2–8), eliminating the 1-week discovery blind spot.
- "Request" / "Request canceled" appointment status handled: filtered before save so pending requests are never stored as confirmed bookings.

## [4.2.0] — 2026-03-07

**Staff Dog Boarding Sync**

- Staff dog boardings ("Staff Boarding (nights)") no longer filtered out; appear in the roster like any other boarding.
- Pet name extracted from the schedule event title when no `.event-pet` element is present.

## [4.1.1] — 2026-03-06

**Image Polish**

- AGYD brand colors applied to roster image (forest green header, sage green worker names).
- Live schedule refresh added before image build so the image reflects current data, not stale midnight-cron state.
- Duplicate dog names per worker deduplicated.
- `updated_at` column and trigger on `daytime_appointments` (migration 019).

## [4.1.0] — 2026-03-06

**Daily Roster Image + WhatsApp Notifications**

> Architectural milestone: PNG generation via Satori; hash-gated change detection prevents duplicate sends.

- `api/roster-image.js` — token-gated PNG endpoint showing per-worker dog groups with diff highlights (adds in green, removes with strikethrough).
- `api/notify.js` — orchestrates image generation and Twilio delivery at 4am, 7am, and 8:30am PST on weekdays.
- Hash-based deduplication: 7am and 8:30am windows only send if roster data changed since the last send.
- `pictureOfDay.js` — data layer for `daytime_appointments` queries and worker diff computation.

## [4.0.0] — 2026-03-05

**Daytime Activity Intelligence**

- `daytimeSchedule.js` — pure regex parser (Node.js-safe) for the weekly schedule page; classifies DC/PG/Boarding events, extracts workers, pet IDs, series IDs, and pickup flags.
- `daytime_appointments` and `workers` tables added (migration 018); seeded with all 6 staff.
- Piggybacks on schedule HTML already fetched by `cron-schedule.js` — no extra network requests.

## [3.2.0] — 2026-03-04

**AM/PM Display**

- Check-in/check-out AM/PM captured from external site and stored on boardings (migration 017).
- Calendar detail panel and dogs page now show AM/PM in arrival/departure display.

## [3.1.0] — 2026-03-04

**Code Hardening & Tests**

- 697 tests passing, 0 failures; resolved 9 pre-existing test failures and all 21 lint errors.
- `sync.js` drain loop capped at MAX_DRAIN=20 to prevent runaway browser sync.

## [3.0.0] — 2026-03-04

**Boarding Forms Pipeline**

- Forms scraping: fetch, parse, match, and store boarding intake forms from external site.
- 7-day submission window matching; date discrepancy detection flag on forms.
- Boarding Form Modal in UI with priority fields, date mismatch alert, and print support.

## [2.0.0] — 2026-01-02

**External Data Sync**

> Architectural milestone: automated sync from external booking system with no vendor API.

- Full sync pipeline: appointment list scraping → detail extraction → data mapping → database upsert.
- Session-based authentication against AGYD; session stored in Supabase for cron reuse.
- 486 tests passing.

## [1.2.0] — 2026-01-01

**Production Readiness**

- Stability and reliability improvements ahead of live deployment.

## [1.0.0] — 2025-12-31

**Initial Release**

- Dog management, boarding calendar matrix, employee assignments, and payroll tracking.
- Multi-user auth via Supabase; PWA support; CSV import/export.
- Stack: React + Vite + Tailwind CSS + Supabase + Vercel.

---

[5.3.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v5.3.0
[5.2.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v5.2.0
[5.1.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v5.1.0
[5.0.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v5.0.0
[4.4.3]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.4.3
[4.4.2]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.4.2
[4.4.1]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.4.1
[4.4.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.4.0
[4.3.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.3.0
[4.2.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.2
[4.1.1]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.1.1
[4.1.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.1.0
[4.0.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v4.0.0
[3.2.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v3.2.0
[3.1.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v3.1.0
[3.0.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v3.0.0
[2.0.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v2.0.0
[1.2.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v1.2.0
[1.0.0]: https://github.com/kcoffie/dog-boarding/releases/tag/v1.0
