# ADR-001: Scraping Strategy

**Status:** Accepted
**Date:** 2024 (initial), revised March 2026

---

## Context

The dog boarding business manages all bookings through [agirlandyourdog.com](https://agirlandyourdog.com), a third-party platform. Qboard needs to display those bookings, track revenue, manage forms, and send daily roster notifications.

The central engineering question: **how do we get the data?**

---

## Options considered

### Option 1: Official API
agirlandyourdog.com provides no public API. No OAuth flow, no webhooks, no data export endpoint. This option does not exist.

### Option 2: CSV/manual export
The platform offers CSV exports, but only through manual user action in the UI. This requires a human to export and upload data every day. Not suitable for an autonomous system.

### Option 3: Authenticated HTML scraping
Log in as a real user via the web authentication form, maintain a session cookie, fetch and parse the schedule and appointment detail pages. Fragile in theory, but manageable with the right architecture.

---

## Decision

**Option 3: authenticated HTML scraping.**

This was not a default choice — it was the only viable option. But the implementation needed to account for the fragility up front:

### How we made it reliable

**Session management:** authentication takes ~4.5s and produces a cookie with a ~24h TTL. We cache the session in Supabase (`sync_settings` table) and check the TTL before every operation. `ensureSession()` in `sessionCache.js` is the single entry point for all scraper modules — it returns a valid session or re-authenticates transparently. No scraper module handles auth failure; they all call `ensureSession()` and proceed.

**Regex parsing, not DOM:** the sync crons run in a Node.js serverless runtime where `DOMParser` is unavailable. All parsing uses regex against raw HTML strings. This is more fragile than DOM queries in theory, but is deterministic and testable — we capture real HTML pages as test fixtures and run parsers against them. When the external site changes its structure, a fixture test fails immediately, before the change reaches production.

**HTML fixtures for every behavior:** every parser has a corresponding `.html` fixture in `src/__tests__/fixtures/`. Any change to the external site's HTML structure will fail a test before it silently breaks the sync.

**6-layer sync filter:** the schedule page shows all appointment types (boarding, daycare, pack groups, evaluations). We need only overnight boarding. Rather than a single filter that misses edge cases, there are 6 independent filter layers:
1. Archived ID check (preloaded Set, no DB round-trip per appointment)
2. Title pre-filter (before fetching detail pages — saves network calls)
3. Title post-filter (after detail fetch — catches additional patterns)
4. Pricing filter (day-service-only appointments → skip; even free "staff boarding" passes)
5. Date-overlap filter (skip if outside requested sync range)
6. Early-stop pagination (stop scanning once all visible appointments exceed the end date)

**Amended appointment reconciliation:** when a booking is amended, the old URL returns a 404-equivalent (the page renders the schedule homepage, not an error). `reconcile.js` detects this pattern via absence of `data-start_scheduled` attribute and archives the old record. This prevents phantom boardings from staying visible indefinitely.

### Known risks and mitigations

| Risk | Mitigation |
|---|---|
| External site changes HTML structure | Fixture-based test suite fails immediately; scraper is modular so patches are isolated |
| Session expires mid-cron | `ensureSession()` re-authenticates on TTL miss; each cron is independent |
| External site goes down | All crons are non-fatal; sync queue is durable — missed appointments are picked up the next night |
| Rate limiting / IP ban | All scraping is low-frequency (4 cron invocations per night, ~1 request each); no parallel scraping |

---

## Consequences

- The system runs autonomously without manual data entry
- Parser tests catch external site changes before they reach production
- Session management is centralized and self-healing
- The integration check (Playwright + DB comparison) provides an independent correctness signal that the scrapers can't provide about themselves
