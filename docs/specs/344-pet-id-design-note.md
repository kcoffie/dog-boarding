# #344 design note: the sync writes wrong pet IDs and renames dogs

**Status:** draft for the architect, 2026-10-23 (session 47). No code until Kate approves this note and its ADR.
**Rule for this work (Kate):** done correctly the first time, no guessing. Every claim below cites the code, a recorded page or a table count. What isn't proven is listed under "Open questions", not assumed.

## Problem
A dog row can end up with another pet's booking-site pet ID, or **another dog's name**. Boarding forms are fetched by pet ID (REQ-501), so a wrong ID can show another client's pet's form. A wrong name puts one dog's boardings, roster lines and pay nights under a different dog.

## What the evidence shows (read-only: code, recorded pages, Supabase; no booking-site requests)

### 1. The "group playgroup listings" are the schedule's week page, served after a redirect
#344 first described these as weekly group listings. They aren't.
- **All 74** `sync_appointments` rows with no check-in date (of 481) have a heading like "Oct 18-24, 2026". All 74 weeks start on a Sunday (the schedule's weeks run Sunday to Saturday), and every one contains the Pacific day the row was fetched. Each row's `raw_data` holds **208 to 267 pet names**: a whole week of the schedule, not one booking. None has a boarding.
- `C63QhLBU` proves it. Its `previous_data` is a real boarding, "10/29pm-11/1", with the client's note, and its queue title is still "10/29pm-11/1". At 2026-10-23 12:59 UTC the same URL was saved as "Oct 18-24, 2026" with no dates.
- **Mechanism, from the code.** On the server (cron-detail, and the Integration Check's `runDetailSync`), `authenticatedFetch` calls plain `fetch` (`src/lib/scraper/auth.js`, the direct-fetch branch), which **follows redirects**. A removed booking's URL answers 302 → `/schedule` (seen 2026-10-21; `reconcile.js` relies on it). So the sync parses the schedule page as if it were the appointment.
  - `parseAppointmentPage` takes the week heading as `service_type`, finds no dates, sets `pet_name` = the first `.event-pet` on the week, and `all_pet_names` = every pet on the week.
  - The browser path (Sync Now via `sync-proxy`) doesn't follow redirects; it throws, so it never saved a week page.

### 2. What a week page does to the dogs (`mapping.js`, `mapAndSaveAppointment`)
The dog is saved **before** the dates are checked, with:
- `pet_name` = the week's first pet;
- `externalPetId` = `petIds[0]` from the schedule block of the **removed booking** (stored on the queue item when it was enqueued, `syncRunner.js` `meta.external_pet_id`).

Then `upsertDog` does one of two things:
- **(a) A dog is keyed by that booking ID** (`dogs.external_id` is the ID of the last booking matched to the dog, not a pet ID). That dog is **renamed** to the week's first pet: `updateFields.name`. Seen on `C63QhLBU`, 10-23 12:59: the row's 3 older bookings (2024-11, 2026-04, 2026-06) all name a different pet. The row now carries the week's first dog's name, and another row with that name already exists. **This is live, unrepaired data damage.**
- **(b) No dog is keyed by it.** The week's first pet is matched by name (`findDogByName`: `ilike` + `limit(1)`, no order). That dog is given the removed booking's ID as its key and the removed booking's pet ID. These are the 3 rows Kate corrected (`C63QgcFx`, `C63QgxR1`, `C63QgznN`). Their own bookings match their names, so they were never renamed.

After that, the secondary-pet loop runs once for each of the other ~200+ names on the week: a name match updates the dog, and no match creates a **new dog with $0 rates and no boarding**. 3 boarding-less dogs were created 2026-10-16 to 10-23; the other 39 boarding-less dogs date from January to June.

### 3. Two-pet bookings: the recorded page pairs name and ID on one element
The recorded detail pages show how the site marks each pet:
- The two-pet page recorded 2026-02-25 (commit `afbf883`, scrubbed in #264). Before the scrub it carried the real pet IDs 90053 and 201014, the household Kate checked on 10-23.
- The request and canceled-request pages recorded 2026-03-17 (#65).

All of them mark each pet as `<a href="/pets/ID" class="event-pet pet-ID" data-pet="ID">Name</a>`, inside `.event-clients-pets[data-uid]` → `.event-pets[data-pets]` → `.event-pet-wrapper[data-pet]`. **The name and its ID are on the same element**, so the detail page alone can pair them, in any order. Today the sync ignores that and takes the ID from the schedule's first `data-pet`. Second pets never get an ID (`mapping.js` 2c), so their forms are never fetched.
- **Correction to #344:** the recorded price divs (`.price.p-N`) carry **no** `data-pet`. Per-pet rates are paired by position (`extractPricing`, `i * numPets + p`). That pairing is unproven (open question 2).

### 4. Today's data (2026-10-23 20:xx UTC)
- 108 dogs: 57 with a pet ID, **none shared** by two dogs.
- Dog names held by more than one row: 2 names. Both rows of one name have (different) pet IDs; neither row of the other has one.
- 38 dogs have `source = 'manual'`, 70 `external`.
- `C63QhLBU`'s boarding, 10-29 → 11-01, $330, is still `confirmed`, though its URL now redirects to `/schedule` (see "Data repair").

## Options
| | What | Stops renames | Correct IDs for second pets | Booking-site requests |
|---|---|---|---|---|
| **A** | Guards only: don't follow redirects on detail fetches, and write nothing for a page with no dates | Yes | No | One **fewer** per removed booking |
| **B** | A + pair each name with the ID on its own element, match dogs by pet ID first, never change a stored ID (keep it, alert Kate) | Yes | Yes | One fewer (as A) |
| **C** | B + re-fetch every dog's pet page to verify | Yes | Yes | +~100 once, more ongoing: rejected (booking-site load is a hard constraint) |

**Recommendation: B, in two PRs**, because renames are happening now:
- **PR 1 (stop the damage, small, ship first).** Detail fetches use `redirect: 'manual'`. A 302 to exactly `/schedule` means **gone**: the queue item is marked done with `detail_skip: 'gone'` and nothing is written. Any other redirect is an error, as on the browser path, and a redirect to `/login` is an expired session, as today. `mapAndSaveAppointment` checks the dates **before** any write, so a page with no check-in and check-out writes no dog, boarding or sync row. It also refuses a page with more than one `.event-clients-pets` block (a week page has many; open question 1).
- **PR 2 (pairing and matching).** Parse `pets: [{ id, name }]` from the detail page's own `.event-pet[data-pet]` elements, then for each pet:
  1. **A dog with that pet ID exists:** that's the dog. Update its name only if the site's name for that ID changed (logged).
  2. **No dog with that pet ID:**
     - exactly one dog with that exact name (trimmed, case-insensitive) and **no** pet ID: link it (set the ID);
     - no dog with that name: create one with the ID;
     - one with that name but a **different** pet ID: it's a different dog, so create a new one;
     - **two or more dogs with that name and no pet ID:** write nothing for this pet and alert Kate (no arbitrary pick).
  3. **The page shows a pet with no `data-pet`:** today's behaviour for that pet minus the arbitrary match (create, or link only to a single unambiguous name), no ID written, logged.
  4. **Never change a stored pet ID.** If a code path would set a different ID on a dog that has one, keep the stored one, write nothing for that pet and alert Kate. A unique index on `dogs.external_pet_id` (not null) makes a duplicate a loud database error, not a silent overwrite (migration, Kate runs it; today's data already satisfies it).
  5. The schedule's `petIds` stop being a source of the dog's ID. They are kept only as a cross-check: a schedule ID missing from the detail page is logged.

## What breaks / what changes
- `upsertDog` stops matching on `external_id` (booking ID) for identity once a pet ID is known. `dogs.external_id` keeps being written for the boarding link only. Any other reader of `dogs.external_id` must be listed by the architect before PR 2.
- A removed booking's boarding is still not archived by the detail path; that stays with reconciliation (#316, #318 step 4).
- Second pets get IDs, so their form jobs start: a few extra form fetches **per two-pet booking**, not new pages per sync. The count goes in PR 2's description.
- The Integration Check's sync runs the same code, so it is covered too.

## Threat
No new secret or endpoint. The risk this removes is showing one client's pet's form under another dog. The alert text goes to Kate on Telegram (client data in alerts is OK, Kate 2026-10-19). The repo stays free of names: tests use synthetic names and IDs.

## How we'll know it works (and when it doesn't)
- **Tests from the recorded shapes** (synthetic names, expected values worked out by hand, each seen failing once before the fix):
  - a 302 to `/schedule` writes nothing and marks the item `gone`;
  - a week page (many `.event-clients-pets`, no dates) writes nothing;
  - a two-pet page listed B then A gives each dog its own ID;
  - a second pet gets its ID and a form job;
  - a different ID for a dog that has one keeps the stored ID and alerts;
  - two same-name dogs with no pet ID: nothing written, alert;
  - a dog with the same name but a different ID: a new dog is created.
- **Production, after each PR:** no new `sync_appointments` row with no dates (today: 74); no dog `updated_at` from a `gone` item; the 4 checked rows keep their IDs; boarding-less dogs stop being created; and `detail_skip = 'gone'` is counted in the run result so ops-watch can see it.
- **Mutation:** the changed lines in `mapping.js`, `auth.js` and `syncRunner.js`, scoped Stryker, reported against the 80% new-code bar.

## Data repair (Kate decides; Kate runs any SQL)
1. **`C63QhLBU`'s dog was renamed on 10-23.** Restore its name from its own bookings, after Kate checks pet 204168's page on the booking site.
2. **`C63QhLBU`'s 10-29 → 11-01 boarding ($330, confirmed)** may be a removed or changed booking. Kate checks it on the booking site before 10-29 (it's on the roster and pay).
3. **The other 73 week-page rows:** decide whether to delete them (they hold whole weeks of names) or leave them for #318's clean-up.
4. **Boarding-less $0 dogs:** 3 created since 10-16, likely by week pages (not proven: no log ties a row to a run). Review together with the 19 $0-rate dogs from dry-run 1.

## Open questions (not assumed)
1. **Is one `.event-clients-pets` block per appointment always true?** It is in all 3 recorded appointment pages. A multi-client appointment would break the week-page guard. Proposed check without new requests: PR 1 logs the count on every real detail page for a week before the guard rejects on it; until then the guard is "no dates".
2. **Per-pet rates by position:** do the `.price.p-N` divs follow the same order as the pet links? Not provable from the recordings. Kate can confirm on one two-pet booking on the booking site (she looks; we make no requests).
3. **Do all page types carry `data-pet` on `.event-pet`?** Proven for the two-pet boarding, request and canceled-request pages. PR 2 logs any `.event-pet` without `data-pet` and writes no ID for it.
4. **A pet renamed on the booking site (same ID):** update the name silently (logged), or also alert Kate?
5. **Alert volume:** one Telegram alert per conflict per run, or one summary per run? Recommend one summary per run.
