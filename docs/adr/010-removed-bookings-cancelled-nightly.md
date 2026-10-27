# ADR-010: A booking removed on the booking site is cancelled by the nightly sync, and restored on proof

**Status:** Accepted (Kate, 2026-10-26)
**Date:** 2026-10-26 (#316)
**Supersedes:** nothing. It moves part of #318 step 4 (reconciliation) forward into today's nightly cron.

---

## Context
- **Only the browser's Sync Now noticed a booking deleted on the booking site.** The scheduled syncs read the bookings they see on the week pages, and a deleted booking isn't there. So it stayed on the rosters and in pay until someone pressed Sync Now: `C63QhHuu` on the 10-20 roster, and `C63QhB7h` (11-03) in October.
- **A cancellation was also permanent.** Sync Now skipped archived bookings forever, and nothing cleared `cancelled_at`.
- This breaks Kate's rule that the booking site is the source of truth (2026-10-23).

Evidence and counts: `docs/specs/316-removed-bookings-design-note.md`.

## Decision
- **The nightly `cron-schedule` reconciles the two weeks it reads:** this week's and next week's pages, Sunday to Saturday, as site clock values (ADR-009).
  - A stored booking in that window that's on no page read that night is opened once, without following redirects.
  - A 302 → `/schedule` is the proof that it's gone (seen twice: 10-21, and Kate's Network tab on 10-26). The proof rules and limits are #324's: at most 10 opened, at most 3 marked, and any unexpected answer stops it.
  - Only this cron reconciles. The Integration Check's scans stay check-only.
- **A removed booking cancels every one of its boardings** (one per dog), then is archived.
- **A cancelled booking that's back on the site is restored only on proof:** re-queued, read, saved, and then un-cancelled. It isn't restored if one of its dogs already has another live boarding over those dates.
- **One Telegram alert per night with anything to say** (job `sync-reconcile`). An undelivered alert turns the run red.
- **The first night after the deploy only reports** (Kate, Q5).

## Options rejected
- **Wait for #318 step 4** (the daily full pass): around late November, after `C63QhB7h`'s stay.
- **The Integration Check reports and Kate cancels by hand:** a hand edit, against the source-of-truth rule.
- **Before cancelling, also open the booking's ID-only URL** to catch a booking moved more than two weeks out (Kate, Q4: no). It costs a request, and it's unproven that the site serves the current booking there. The restore heals that case instead.

## Consequences
- **About 0 extra booking-site requests on most nights;** 10 at most.
- **A booking moved more than two weeks out is cancelled until it shows up on a schedule page again.** The cursor week usually still lists it, which keeps it from being a candidate at all. When it does show up, it's restored, and both alerts name it.
- **A deleted booking is off the rosters from the next morning.** The cron runs at 5–6pm Pacific.
- **#318's engine inherits this:** the logic lives in `reconcile.js` and `syncRunner.js`.
