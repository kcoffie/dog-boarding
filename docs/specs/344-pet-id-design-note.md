# #344 design note: the sync writes wrong pet IDs and renames dogs

**Status:** v2, **approved by Kate 2026-10-23** (session 47). The architect reviewed v1 ("proceed with changes"), and every must-change is folded in below. Decision record: `docs/adr/008-dog-identity-is-the-pet-id.md` (Accepted).
**Rule for this work (Kate):** done correctly the first time, no guessing. Every claim below cites the code, a recorded page or a table count. What isn't proven is listed under "Open questions", not assumed.

## Problem
A dog row can end up with another pet's booking-site pet ID, or **another dog's name**. Boarding forms are fetched by pet ID (REQ-501), so a wrong ID can show another client's pet's form. A wrong name puts one dog's boardings, roster lines and pay nights under a different dog.

## What the evidence shows (read-only: code, recorded pages, Supabase; no booking-site requests)

### 1. The "group playgroup listings" are the schedule's week page, served after a redirect
- **All 74** `sync_appointments` rows with no check-in date (of 481) are week pages:
  - each heading reads like "Oct 18-24, 2026", and all 74 weeks start on a Sunday (the schedule's weeks run Sunday to Saturday);
  - every one contains the Pacific day the row was fetched;
  - each `raw_data` holds **208 to 267 pet names**;
  - none has a boarding.
- **Mechanism, from the code.** On the server, `authenticatedFetch` calls plain `fetch` (`src/lib/scraper/auth.js`, the direct-fetch branch), which **follows redirects**. The server paths are cron-detail, cron-detail-2 and the Integration Check, all through `runDetailSync`. When a booking's URL answers 302 → `/schedule`, the sync parses the schedule page as the appointment:
  - the heading becomes `service_type`, and there are no dates;
  - `pet_name` = the week's first `.event-pet`;
  - `all_pet_names` = every pet on the week.
  - Sync Now goes through `sync-proxy`, which doesn't follow redirects, so it throws and never saved a week page.
- **A redirect to `/schedule` does not mean "removed".**
  - All 74 IDs were on the schedule (they're in `daytime_appointments`).
  - **64** have playgroup-series titles ("PG FT", "P/G TWTH", "PG:T/W/TH"...); **10** look like real stays (e.g. "10/29pm-11/1", "3/17-19", "9/5-8 (...)").
  - So the redirect means "the site won't show this URL as an appointment". Why the site redirects a series that still exists isn't known (open question 6).
  - A stay's URL carries its start timestamp, so an edited stay gets a new URL and the old one may redirect too.
- **Proven on 2026-10-23 (Kate checked the booking site):** `C63QhLBU`'s stay is valid at a **new URL** (timestamp `1793268000`; the stored one is `1793289600`, 6 h later). The start was edited, and the old URL redirects. So an edited stay does redirect, which is why must-change "`detail_redirect`, not `detail_skip`" matters.
- `C63QhLBU` is one of the real stays. Its `previous_data` is a real boarding, "10/29pm-11/1", with the client's note. At 2026-10-23 12:59 UTC the same URL was saved as "Oct 18-24, 2026" with no dates.

### 2. What a week page does to the dogs (`mapping.js`, `mapAndSaveAppointment`)
The dog is saved **before** the dates are checked, with:
- `pet_name` = the week's first pet;
- `externalPetId` = `petIds[0]` from the schedule block of the redirected booking (stored on the queue item when it was enqueued, `syncRunner.js` `meta.external_pet_id`).

Then `upsertDog` does one of two things:
- **(a) A dog is keyed by that booking ID** (`dogs.external_id` is the ID of the last booking matched to the dog, not a pet ID). That dog is **renamed** to the week's first pet (`updateFields.name`). Seen on `C63QhLBU`, 10-23 12:59: the row's 3 older bookings (2024-11, 2026-04, 2026-06) all name a different pet. The row now carries the week's first dog's name, and another row with that name already exists. **Live, unrepaired data damage.**
- **(b) No dog is keyed by it.** The week's first pet is matched by name (`findDogByName`: `ilike` + `limit(1)`, no order). That dog is given the redirected booking's ID as its key and that booking's pet ID. These are the 3 rows Kate corrected (`C63QgcFx`, `C63QgxR1`, `C63QgznN`). Their own bookings match their names, so they weren't renamed.

After that, the secondary-pet loop runs once for each of the other ~200+ names: a name match updates the dog, and no match creates a **new dog with $0 rates and no boarding**. 3 boarding-less dogs were created 2026-10-16 to 10-23 (likely this, not proven); the other 39 date from January to June.

### 3. How the detail page marks pets
- **Proven, on the single-pet request and canceled-request pages recorded 2026-03-17 (#65):** `.event-clients-pets[data-uid]` → `.event-pets[data-pets]` → `.event-pet-wrapper[data-pet]` → `<a href="/pets/ID" class="event-pet pet-ID" data-pet="ID">Name</a>`. The name and its ID are on the same element.
- **The two-pet fixture (commit `afbf883`, 2026-02-25) is weaker evidence.**
  - What it shows: two bare `<a class="event-pet pet-N" data-pet="N">` elements. Before the #264 scrub they carried the real IDs 90053 and 201014, the household Kate checked on 10-23.
  - What it lacks: the nesting. It looks hand-assembled, so it proves the per-pet element exists on a two-pet page, not the full structure (open question 3).
- **Confirmed on two real two-pet bookings (2026-10-23, Kate's Chrome, read-only, with her OK; `C63QhFVc` and `C63QhB7h`):**
  - Both have the full nesting: `.event-clients-pets[data-uid]` → `.event-pets.pets-count-2[data-pets]` → `.event-pet-wrapper[data-pet]` → `a.event-pet[data-pet][href="/pets/N"]`. Each page has one `.event-clients-pets`.
  - **Every price div carries `data-pet` and `data-client`.** Each rate belongs to a pet by ID, not by position. The recorded fixture had lost these attributes.
  - The `p-N` class is not a pet index: both pets' night prices are `p-7`.
  - **The order differs inside one page.** On `C63QhB7h` the container says `data-pets="201014,90053"`, but the pet links come 90053 first, then 201014. Pairing by position can take the wrong ID on an ordinary two-pet booking; pairing by ID can't.
  - Caveat: these were read from Chrome's rendered page, not the raw HTML the sync downloads. PR 2's tests use these shapes, and PR 2 logs (without names) what the first real raw page holds before relying on it.
- Today the sync ignores the per-pet ID and takes the schedule's first `data-pet`. Second pets never get an ID (`mapping.js` 2c), so their forms are never fetched.
- `extractAllPetNames`' regex `event-pet[^"]*` also matches `event-pets` and `event-pet-wrapper`. They're dropped only because their text is whitespace.
- The recorded price divs carry no `data-pet`, but the real ones do (above). Per-pet rates are paired by position today; PR 2 pairs them by `data-pet`.

### 4. Today's data (2026-10-23 ~21:00 UTC)
- Dogs:
  - 108 dogs: 57 with a pet ID, **none shared**; no `dogs.external_id` is shared either.
  - 2 names held by more than one row: one name's two rows have different pet IDs; the other name's two rows have none.
  - 38 dogs `manual`, 70 `external`.
  - 42 dogs have no boarding.
- 27 secondary boardings are keyed `<booking>_pN` (by position).
- `C63QhLBU`'s boarding, 10-29 → 11-01, $330, is still `confirmed`, though its URL now redirects (see "Data repair").

### 5. Who reads and writes the two dog columns (architect, checked)
- **Writers:** `mapping.js`:
  - `mapToDog` (`external_id`);
  - `mapAndSaveAppointment` (`external_pet_id` from `externalPetId`);
  - `upsertDog`'s 4 update paths and its insert.
  - The value comes from `syncRunner.js` (enqueue `meta.external_pet_id = petIds[0]`, read back for the detail job) and `sync.js` (`appt.petIds?.[0]`).
- **Readers:**
  - `mapping.js` `findDogByExternalId` / `findDogByName`.
  - `useDogs.js` selects `*`, but no UI uses either column.
  - Nothing in `api/` or `scripts/` reads them.
  - The form chain takes the pet ID from queue meta, not the dog.
  - Indexes: non-unique on `external_id` (005) and on `external_pet_id` (016).

## Options
| | What | Stops renames | Correct IDs for second pets | Booking-site requests |
|---|---|---|---|---|
| **A** | Guards only: don't follow redirects on detail fetches, and write nothing for a page with no dates | Yes | No | One **fewer** per redirected fetch (1 instead of 302 + GET /schedule) |
| **B** | A + pair each name with the ID on its own element, identify dogs by pet ID, never change a stored ID or rename on it (alert Kate) | Yes | Yes | As A, plus 2 form fetches per secondary pet on a current or upcoming multi-pet boarding |
| **C** | B + re-fetch every dog's pet page to verify | Yes | Yes | +~100 once, more ongoing: rejected (booking-site load is a hard constraint) |

**Recommendation: B, in two PRs, with a data check between them.**

### PR 1: stop the damage (small; ships first)
1. **`fetchAppointmentDetails` fetches with `redirect: 'manual'`,** so every caller gets it (`runDetailSync` for cron-detail, cron-detail-2 and the Integration Check; `sync.js` for Sync Now). It reuses `reconcile.js`'s `classifyCandidateResponse`, moved to a shared helper, rather than writing a second classifier. Outcomes:
   - **302 to exactly `/schedule` → `redirected_to_schedule`:** write nothing. The queue item is marked done with **`meta.detail_redirect`**, **not** `detail_skip`. `describeEdit` (`syncQueue.js`) ignores URL changes on items with `detail_skip`, so an edited stay would never be read again; with `detail_redirect` the next scan re-queues it when its URL changes.
   - **If that booking's `sync_appointments` row has dates or a linked boarding,** it's a real stay we can no longer read (moved or removed, like `C63QhLBU`). It goes in the run's alert summary to Kate.
   - **302 to `/login` → throw a message containing exactly `Session expired`,** which `runDetailSync` already matches to clear the session and re-queue.
   - **Any other redirect → `redirected_elsewhere`:** marked done, counted, and in the alert summary. It doesn't go through `markFailed`, whose retries plus re-queues could mean up to 4 fetches a scan.
2. **A 200 page with no check-in or check-out writes nothing.** The check moves to before `upsertDog` in `mapAndSaveAppointment`. That page means the layout broke: count it, alert, and do **not** set `detail_skip`.
3. **Form fetches (`forms.js`) also use `redirect: 'manual'`.** A form list that redirects to `/schedule` parses as 0 forms today and could store an empty form for good.
4. Each run's result counts `redirected_to_schedule`, `redirected_elsewhere` and `dateless_page`, so ops-watch can read them. One Telegram summary per run, deduplicated per booking so 4 scans a day don't repeat it (`alertAndLog`).

### Between PR 1 and PR 2: data check (Kate)
Data repair items 1–2 below, and a re-check of the 57 stored pet IDs. The audit's evidence (queue meta) was the same buggy value, so the stored IDs are unproven until checked against something else. Proposed check without booking-site requests: each dog's stored ID against the IDs PR 2's parser reads from that dog's own recorded bookings, as they're re-read. PR 2 doesn't merge until the known-wrong rows are fixed.

### PR 2: pair, identify, never overwrite
1. **Parse `pets: [{ id, name }]`** from the detail page's own pet elements:
   - match the class token `event-pet` exactly;
   - require `href="/pets/N"` to agree with `data-pet="N"`;
   - IDs trimmed, digits only.
   - A pet element without an ID is logged and gets no ID.
   - A page with no pet element writes no dog. The title fallback `pet_name = item.title` stays only for the staff-boarding case it was written for.
2. **For each pet:**
   - **A dog with that pet ID exists:** that's the dog. If the site's name differs, **alert, don't rename** (a wrong stored ID would otherwise rename the right dog). Never rename a `source = 'manual'` dog.
   - **No dog with that pet ID:**
     - exactly one dog with that exact name (trimmed, case-insensitive), **no** pet ID, and its existing bookings (`sync_appointments.mapped_dog_id`) from the same client (the page's `data-uid` or client name): link it;
     - no such dog: create one with the ID;
     - same name but a different pet ID: a different dog, so create a new one;
     - two or more same-name dogs with no pet ID, or a name match from another client: write nothing for this pet and alert.
3. **A pet ID is written only where none is stored, in the same query:** `update … .eq('id', dogId).is('external_pet_id', null)`, then check the row count. If 0 rows changed, re-read and treat it as a conflict (alert, no write). This covers cron-detail, cron-detail-2 and the Integration Check racing each other.
4. **Unique index on `dogs.external_pet_id`** (replaces 016's non-unique one; NULLs stay allowed). Today's data passes it. Kate runs the migration before PR 2 deploys. PR 2 handles a unique violation (23505) by re-reading by pet ID, and works whether or not the index exists yet.
5. **Boardings per pet:**
   - each pet's boarding is found first by the booking's ID or its `_pN` variants **and this dog's ID**, and only then fills a free slot;
   - a change in pet order never moves a boarding to another dog;
   - the primary boarding's `billed_amount` stays as today.
6. **Stop writing `dogs.external_id`** (nothing else reads it). Stop reading `meta.external_pet_id` for appointment items (`requeueFields` merges meta, so stale IDs persist there). The schedule's `petIds` become a cross-check only: one missing from the detail page is logged.
7. The logic lives in `mapping.js` / `extraction.js`, so #318 step 3's engine inherits it.
8. After PR 2, flag any stored `boarding_forms.external_pet_id` that differs from its boarding's dog's pet ID.

## What breaks / what changes
- Items that redirect are no longer retried as failures; they wait for a URL or title change on the next scan.
- A redirected real stay's boarding is still not archived by the detail path; that stays with reconciliation (#316, #318 step 4). PR 1 makes it visible to Kate instead of silent.
- Second pets get IDs, so their form jobs start: 2 form fetches per secondary pet on a current or upcoming multi-pet boarding.
- A dog whose name changes on the booking site keeps its old name in the app until Kate acts on the alert (Kate: alert only).

## Threat
No new secret or endpoint. The risk this removes is showing one client's pet's form under another dog. The alert text goes to Kate on Telegram (client data in alerts is OK, Kate 2026-10-19). The repo stays free of names: tests use synthetic names and IDs.

## How we'll know it works (and when it doesn't)
**Tests.** Synthetic names, shapes from the recorded pages, expected values worked out by hand, each seen failing once before the fix:
- **PR 1:**
  - one real Node test against a local `http.createServer` answering 302 with a `Location`, proving `fetch(..., { redirect: 'manual' })` returns 302 with `Location` readable (a mocked Response proves nothing about undici);
  - a 302 to `/schedule` writes no dog, boarding or sync row, and marks the item `detail_redirect`, not `detail_skip`;
  - that item **is** re-queued when the next scan brings a new URL timestamp;
  - a 302 to `/login` clears the session and re-queues;
  - a redirect elsewhere is counted and not retried;
  - a redirected item whose stored row has dates is in the alert summary;
  - a dateless 200 page writes nothing and is counted;
  - a form-list redirect stores no form.
- **PR 2:**
  - a two-pet page listed B then A gives each dog its own ID;
  - a second pet gets its ID and a form job;
  - a known ID with a different name alerts and doesn't rename;
  - a dog with a different stored ID keeps it and alerts;
  - two same-name dogs with no pet ID: nothing written, alert;
  - same name but a different ID: a new dog;
  - same name from another client: no link;
  - two concurrent links of one dog: one wins, the other alerts;
  - a pet-order swap keeps every boarding on its dog;
  - `event-pets` / `event-pet-wrapper` text is never read as a name;
  - a mismatched `href` and `data-pet` gives no ID.

**Production, after each PR:**
- no new `sync_appointments` row without dates (today: 74);
- no dog renamed by the sync;
- the 4 checked rows keep their IDs;
- boarding-less dogs stop being created;
- the run counts above appear in `cron_health` and ops-watch;
- a daily count of redirected items that held dates.

**Mutation:** scoped Stryker on the changed lines (`extraction.js`, `mapping.js`, `syncRunner.js`, `forms.js`, the shared classifier), reported against the 80% new-code bar.

## Data repair (Kate decides; Kate runs any SQL)
1. **`C63QhLBU`'s dog was renamed on 10-23.** Kate checked pet 204168's page: it matches the name on the row's 3 older bookings. Guarded one-row SQL for Kate to run. A separate hand-entered row with a similar name and no pet ID may be the same dog: Kate decides.
2. **`C63QhLBU`'s 10-29 → 11-01 boarding ($330, confirmed):** the stay is valid (Kate, 10-23); only its start time changed. The next scan should re-queue it on the new URL (the item has no `detail_skip`); check the boarding's times afterwards.
3. **The other 9 week-page rows that look like real stays:** the same check, after PR 1 lists them.
4. **The 74 week-page `sync_appointments` rows:** delete them, since each holds a whole week of names (Kate's SQL), or leave them for #318's clean-up.
5. **Boarding-less $0 dogs:** 3 created since 10-16, likely by week pages. Review them together with the 19 $0-rate dogs from dry-run 1.

## Open questions (not assumed)
1. **Is there always one `.event-clients-pets` block per appointment?** True on the recorded pages, but unproven for multi-client appointments. Not used as a guard; "no dates" is the guard.
2. ~~Per-pet rates by position~~ **Answered (10-23):** real price divs carry `data-pet`. PR 2 reads each pet's rate by ID; a price div without `data-pet` gives no rate for that pet (logged).
3. ~~The two-pet page's full structure~~ **Answered (10-23)** from two real bookings, as rendered by Chrome. PR 2 still logs the raw page's shape the first time it reads one.
4. ~~A pet renamed on the booking site~~ **Decided (Kate, 10-23): alert only**, never rename automatically.
5. ~~Alert volume~~ **Decided (Kate, 10-23): one summary per run**, deduplicated per booking.
6. **Why does the site redirect a playgroup series that is still on the schedule?** Unknown. It doesn't change the fix (nothing is written either way), but the run counts will show how often it happens.
