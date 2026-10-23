# ADR-008: A dog is its booking-site pet ID; booking pages are read without following redirects

**Status:** Accepted (Kate, 2026-10-23)
**Date:** 2026-10-23 (#344)
**Supersedes:** nothing. It narrows ADR-001's scraping strategy for detail and form pages.

---

## Context
The sync identified dogs by position and by name:
- the first `data-pet` on the schedule, paired with the first pet name on the detail page;
- `dogs.external_id`, the ID of the last booking matched to the dog;
- a name match (`ilike`, `limit 1`, no order).

It also followed redirects on the server.

When the booking site redirected a booking's URL to `/schedule`, the sync read the whole week's schedule as if it were the booking (74 of 481 saved bookings, 2026-02 to 2026-10). That:
- gave a dog another pet's ID (3 rows Kate corrected on 10-23);
- **renamed** a dog to the week's first dog (`C63QhLBU`, 10-23);
- created $0 dogs with no boardings.

Two-pet bookings never gave the second pet an ID. Boarding forms are fetched by pet ID, so a wrong ID can show another client's pet's form. Evidence and counts: `docs/specs/344-pet-id-design-note.md`.

## Decision
- **A dog is identified by its booking-site pet ID.** The ID is read from the same `.event-pet` element as the pet's name on the booking's own page (`data-pet`, which must agree with `href="/pets/N"`).
  - Schedule order and booking IDs are no longer used for identity, and the sync stops writing `dogs.external_id`.
  - A name match is used only to link a dog that has no ID yet, and only when exactly one same-name dog from the same client exists.
- **The sync never changes a stored pet ID, and never renames a dog on its own.**
  - A pet ID is written only where none is stored, in the same query.
  - A unique index on `dogs.external_pet_id` makes a duplicate a database error.
  - A conflict, an ambiguous name, or a different name for a known ID is reported to Kate (one summary per run) instead of being written.
- **Booking and form pages are fetched without following redirects**, through one shared classifier:
  - a redirect to `/schedule` writes nothing, and leaves the item open to re-queue when its URL changes;
  - a redirect to `/login` means the session expired;
  - anything else is counted and reported.
- **A booking page with no dates writes nothing.**

## Options rejected
- **Guards only (no redirects, no dateless writes) and keep today's matching:** stops renames but leaves second pets without IDs and the arbitrary name match in place.
- **Re-fetch every dog's pet page to verify IDs:** about 100 extra booking-site requests once, and more ongoing. Booking-site load is a hard constraint (Kate, 2026-10-21).
- **Trust the schedule's `data-pet` order:** that is the bug.

## Consequences
- **A real stay whose URL redirects** (moved or cancelled) is no longer silently rewritten. It's reported to Kate, and its boarding stays until reconciliation (#316, #318 step 4) handles it.
- **A dog renamed on the booking site** keeps its old name in the app until Kate acts on the alert. Kate chose alert-only, permanently: the sync never renames a dog.
- **Second pets get IDs, so their forms are fetched:** 2 form requests per secondary pet on a current or upcoming multi-pet boarding. A redirected detail fetch costs 1 request instead of 2.
- **The stored pet IDs must be checked before PR 2 merges.** Until then, a wrong stored ID would attach the right pet's bookings to the wrong dog, which is why name differences alert instead of renaming.
- #318 step 3's engine inherits this, because the logic lives in `extraction.js` and `mapping.js`.

Design note: `docs/specs/344-pet-id-design-note.md` (v2, after the architect's review).
