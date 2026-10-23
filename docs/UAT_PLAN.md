# UAT plan: payroll and the daily views (draft, 2026-10-20)

**Status:** draft for Kate. Not yet shared with Charlie.
**Replaces:** sprint plan item G-5 ("no defined client acceptance criteria"). Builds on #13 (Kate's repeatable UAT process).

## Why this matters

The app is only worth building if Charlie uses it to run her week. UAT isn't "does the software pass". It's **"does paying the overnight staff get easier and more trustworthy than how she does it now"**, judged by Charlie and her admin on their own real data.

## Who

| Person | What they do in the app | What UAT asks of them |
|---|---|---|
| Charlie (owner) | Decides who stays which night, pays staff, logs payments | Judges the pay numbers and whether the breakdown is something she'd hand to an employee |
| Charlie's admin | Day-to-day data entry, probably (night assignments, checks). **No account in this app yet** | Judges the effort: is keeping it up to date less work than today? |
| Overnight staff | Receive their pay and the reason for it. Later: the morning roster by SMS (#260) | Not users in UAT. Their view is tested through the breakdown Charlie gives them |
| Kate | Runs the sessions, fixes, reports | Takes notes, turns feedback into issues, ships a quick win each round |

## Charlie's payroll loop, and what the app does today

| Her step | In the app today | Gap (see TODOs below) |
|---|---|---|
| 1. Who stayed which night | Matrix: an employee dropdown per night, "N/A" for nights she or the family stay (REQ-033) | Entered by hand. Is that more work than today? |
| 2. Which dogs were there | Synced nightly from the booking site | A missed, odd or late booking means a wrong number. Boardings can be edited by hand (REQ-020 to REQ-022), **but the next sync silently overwrites the edit**, and a deleted synced boarding comes back |
| 3. What to pay | Sum of each dog's night rate × net % (REQ-032, REQ-040, REQ-203) | A dog with no rate on the booking site counts as $0, silently (#312 step 1 alerts Kate). **No in-app fix, by design (Kate, 2026-10-23):** dogs and rates come only from the booking site, so the app never drifts from it. A wrong or missing rate is fixed on the booking site, and a difference is a sign of something to fix right away |
| 4. Tell the employee, with the calculation | Nothing | No breakdown to share |
| 5. Pay | Outside the app | None |
| 6. Log it | Mark as paid, payment history (REQ-041 to REQ-044) | None known |

## Before UAT starts

Decisions and setup for Kate:
1. **Who gets accounts.** Today every signed-in user can see and change everything, including everyone's pay (REQ-005; #6 asks for admin-only areas). Check the current user list first. Before anyone other than Charlie and her admin signs in, decide what staff may see. **Create the admin's account** in Supabase (Authentication → Users → Add user, with a password, or Send invitation). Supabase sign-up is off (Kate, 2026-10-20), so the app can't create accounts. Dry-run the invite with a spare address of your own first: the app has no special handling for an invite link, so the admin may arrive signed in with no password (#23, #24).
2. **Warn them about two traps.** Settings → Invite Users still makes invite codes, but nothing can redeem them (#307), so don't use it. And a boarding edited by hand is overwritten by the next sync, so report a wrong dog or night (Send a Question) rather than fixing it in the app.
3. **Which gaps to close first.** At least the silent $0 rate, so that the first numbers she sees can be trusted. Ideally the shareable breakdown too, because she'll ask for it first.
4. **The pay period.** Read it off her spreadsheet in step 1. The side by side runs on her real periods.

Say up front what isn't live: the staff roster stopped when WhatsApp locked the account, and it comes back with SMS (#260). UAT judges payroll and the views, not that.

## Step 1: watch first (one 30-minute session, before any demo)

Watch Charlie, then her admin, work out and pay one real period the way they do it today. Don't show the app yet. Write down their words, their tools, and every exception.

Questions:
- Walk me through last week's overnight pay, from "who stayed" to "they got paid".
- Where does each number come from? Where do you write it down?
- How does the employee find out what they're getting, and why? What do they ask you?
- What goes wrong? (Split nights, early or late checkouts, a dog added at the last minute, rate changes, holidays, tips, someone who also worked the day: #20.)
- What would you happily never do again?
- Phone or laptop? When in the day do you do this?

Today this is a spreadsheet, with the dates and boarding dogs ticked by hand. Ask for a copy of one past period's spreadsheet. **Keep it out of the repo,** because the repo is public and the spreadsheet holds client and staff data.

The output is a one-page "how it works today" note and that spreadsheet, kept together as the baseline.

## Step 2: side by side (two real pay periods)

- Charlie pays the way she always has. Her old method stays the fallback until she decides to switch.
- For the same period, the app's amount per employee is compared with her spreadsheet, night by night and dog by dog.
- Every difference gets a cause: a wrong or missing rate, a missing dog, the wrong night or person, or a rule she uses that the app doesn't know. Each cause becomes a fix or a documented rule.
- She switches when the numbers match or the app's number is shown to be the right one, and not before.

## Acceptance criteria (draft, in her words)

Each one is checked on real use by Charlie or her admin, not by the tests. **Kate decides when a criterion is met, in consultation with Charlie.** **Now** means it's testable today. **After X** means it waits on that item.

| # | Criterion | How we check it | When |
|---|---|---|---|
| 1 | "For a pay period, the app's amount for each person matches what I'd have worked out, or the difference is explained and fixed." | The side by side, for two periods in a row | After the $0-rate fix |
| 2 | "I can print each person a page that shows what they're getting and how: which nights, which dogs, the rates and the percentage. I can also send the same picture to their phone. They understand it without me explaining." | Charlie prints one, sends one, and notes the employee's questions | After the breakdown |
| 3 | "Recording a payment takes under a minute, and I can answer 'did I pay X for the week of Y?' from the app alone." | Charlie logs a real payment, then answers a past question from the payment history | Now |
| 4 | "For any week I pick, the nights and dogs in the app match what actually happened. When they don't, I can fix it myself." | Charlie or her admin spot-checks a week against the booking site | Now to check; after the by-hand edit to fix |
| 5 | "The staff on shift get the morning roster on their phones by 7am, every weekday, without me doing anything." | Five weekdays in a row | After #260 |

Support, outside the criteria: "When something looks wrong, I press Send a Question and Kate gets it." Show her this in the first session.

## Feedback, after every pay period (15 minutes)

Three questions, always the same, written down in her words:
1. **Keep:** what do you like? What should never change?
2. **Fix:** what don't you like? What got in the way, or was confusing or wrong?
3. **Wish:** what else would you want it to do?

Each answer becomes an issue, filed with the repo's "UAT Feedback" or "UAT Bug Report" issue template. Then:
- Kate ships at least one of her asks within a week, and tells her which one.
- The January issues (#6 to #24) are triaged with her in the first check-in: keep, change, or close. #11 (sign-up code in the URL) is moot: Supabase sign-up is off, and the invite-code page goes with #301. Close it once #301 merges.
- Per #13: each piece of work starts from an issue number, its clarifying questions get answered, and it gets a requirement and a test. Nothing in production changes until Kate (in consultation with Charlie) says it's ready.

## How we'll know it's used

Decide before starting, then measure from the tables, not by asking:
- For **4 pay periods in a row**, she pays from the app's number and logs every payment in the app (`payments` rows per period).
- Night assignments are filled in for every night of those periods, by her or her admin.
- She uses Send a Question when something looks wrong instead of working around it.

If adoption stalls, ask which step costs more than it's worth, and fix or drop that step.

## Timing

- November, avoiding Thanksgiving week (Nov 26) and the December peak. Don't ask for her attention in the busiest boarding weeks.
- Week 1: watch first, plus the pre-UAT fixes. Then two pay periods side by side with a check-in after each, then four periods to measure adoption. Size the weeks once step 1 shows how long her pay period is.

## TODOs from this plan (Kate, 2026-10-20)

- **Fix:** a dog with no rate fails silently (it counts as $0 toward the night's pay).
- **Fix (was maybe):** a correction by hand (a missed, odd or late booking) must survive the next sync. Today the sync silently overwrites edits to synced boardings and re-creates deleted ones (`src/lib/scraper/mapping.js`).
- **Fix:** a pay breakdown for each employee: what they're being paid and how it was calculated. It's one image (the roster image is already rendered the same way) that prints cleanly and can be sent to a phone. **Charlie sends it from her own phone** (Kate, 2026-10-20). The app never sends it: that would be a message tied to Charlie's business. So the breakdown doesn't depend on #260.
- **Maybe:** notify Charlie when her admin adds or changes boarding info.
- **Maybe:** a clear answer to "something looks wrong at 9pm, what do I do?" (Send a Question exists; make it obvious, and say what happens next).

## Answers (Kate, 2026-10-20)

1. **Pay today:** a spreadsheet, with the dates and boarding dogs ticked by hand. The pay period is still to be read off it in step 1.
2. **The admin's account:** none in this app yet. Kate creates it before UAT.
3. **The breakdown:** printable, to hand out in person, **and** shareable, so the same picture can be sent to a phone.
4. **Who decides a criterion is met:** Kate, in consultation with Charlie.
5. **Who sends the breakdown to a phone:** Charlie, from her own phone. The app never sends it.

Still open: what staff may see once they have accounts.
