# UAT plan: payroll and the daily views (draft, 2026-10-20)

**Status:** draft for Kate. Not yet shared with Charlie.
**Replaces:** sprint plan item G-5 ("no defined client acceptance criteria"). Builds on #13 (Charlie's request for a repeatable UAT process).

## Why this matters

The app is only worth building if Charlie uses it to run her week. UAT isn't "does the software pass". It's **"does paying the overnight staff get easier and more trustworthy than how she does it now"**, judged by Charlie and her admin on their own real data.

## Who

| Person | What they do in the app | What UAT asks of them |
|---|---|---|
| Charlie (owner) | Decides who stays which night, pays staff, logs payments | Judges the pay numbers and whether the breakdown is something she'd hand to an employee |
| Charlie's admin | Probably the day-to-day data entry (night assignments, checks) | Judges the effort: is keeping it up to date less work than today? |
| Overnight staff | Receive their pay and the reason for it. Later: the morning roster by SMS (#260) | Not users in UAT. Their view is tested through the breakdown Charlie gives them |
| Kate | Runs the sessions, fixes, reports | Takes notes, turns feedback into issues, ships a quick win each round |

## Charlie's payroll loop, and what the app does today

| Her step | In the app today | Gap (see TODOs below) |
|---|---|---|
| 1. Who stayed which night | Matrix: an employee dropdown per night, "N/A" for nights she or the family stay (REQ-033) | Entered by hand. Is that more work than today? |
| 2. Which dogs were there | Synced nightly from the booking site | A missed, odd or late booking means a wrong number, and it can't be corrected by hand |
| 3. What to pay | Sum of each dog's night rate × net % (REQ-032, REQ-040, REQ-203) | A dog with no rate on the booking site counts as $0, silently |
| 4. Tell the employee, with the calculation | Nothing | No breakdown to share |
| 5. Pay | Outside the app | None |
| 6. Log it | Mark as paid, payment history (REQ-041 to REQ-044) | None known |

## Before UAT starts

Decisions for Kate:
1. **Who gets accounts.** Today every signed-in user can see and change everything, including everyone's pay (REQ-005; #6 asks for admin-only areas). Before anyone other than Charlie and her admin signs in, decide what staff may see.
2. **Which gaps to close first.** At least the silent $0 rate, so that the first numbers she sees can be trusted. Ideally the shareable breakdown too, because she'll ask for it first.
3. **The pay period.** Is it weekly, every two weeks, or something else? The side-by-side below runs on her real periods.

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

The output is a one-page "how it works today" note, kept as the baseline.

## Step 2: side by side (two real pay periods)

- Charlie pays the way she always has. Her old method stays the fallback until she decides to switch.
- For the same period, the app's amount per employee is compared with hers, line by line.
- Every difference gets a cause: a wrong or missing rate, a missing dog, the wrong night or person, or a rule she uses that the app doesn't know. Each cause becomes a fix or a documented rule.
- She switches when the numbers match or the app's number is shown to be the right one, and not before.

## Acceptance criteria (draft, in her words)

Each one is checked by Charlie or her admin, not by Kate or the tests. **Now** means it's testable today. **After X** means it waits on that item.

| # | Criterion | How we check it | When |
|---|---|---|---|
| 1 | "For a pay period, the app's amount for each person matches what I'd have worked out, or the difference is explained and fixed." | The side by side, for two periods in a row | After the $0-rate fix |
| 2 | "I can give each person a page that shows what they're getting and how: which nights, which dogs, the rates and the percentage. They understand it without me explaining." | Charlie hands one to an employee and notes their questions | After the breakdown |
| 3 | "Recording a payment takes under a minute, and I can answer 'did I pay X for the week of Y?' from the app alone." | Charlie logs a real payment, then answers a past question from the payment history | Now |
| 4 | "For any week I pick, the nights and dogs in the app match what actually happened. When they don't, I can fix it myself." | Charlie or her admin spot-checks a week against the booking site | Now to check; after the by-hand edit to fix |
| 5 | "The staff on shift get the morning roster on their phones by 7am, every weekday, without me doing anything." | Five weekdays in a row | After #260 |

Support, outside the criteria: "When something looks wrong, I press Send a Question and Kate gets it." Show her this in the first session.

## Feedback, after every pay period (15 minutes)

Three questions, always the same, written down in her words:
1. **Keep:** what do you like? What should never change?
2. **Fix:** what don't you like? What got in the way, or was confusing or wrong?
3. **Wish:** what else would you want it to do?

Each answer becomes an issue, filed with the repo's UAT Feedback or UAT Bug issue template. Then:
- Kate ships at least one of her asks within a week, and tells her which one.
- The January issues (#6 to #24) are triaged with her in the first check-in: keep, change, or close. #11 (sign-up code in the URL) is already moot, because self sign-up is gone (#301).
- Per #13: she gives the issue number, answers the clarifying questions, and the work gets a requirement and a test, with nothing in production changing until she says it's ready.

## How we'll know it's used

Decide before starting, then measure from the tables, not by asking:
- For **4 pay periods in a row**, she pays from the app's number and logs every payment in the app (`payments` rows per period).
- Night assignments are filled in for every night of those periods, by her or her admin.
- She uses Send a Question when something looks wrong instead of working around it.

If adoption stalls, ask which step costs more than it's worth, and fix or drop that step.

## Timing

- November, before the holiday peak. Don't ask for her attention in the busiest boarding weeks.
- Week 1: watch first, plus the pre-UAT fixes. Weeks 2 to 5: two pay periods side by side with a check-in after each. Then four periods to measure adoption.

## TODOs from this plan (Kate, 2026-10-20)

- **Fix:** a dog with no rate fails silently (it counts as $0 toward the night's pay).
- **Maybe fix:** let Charlie or her admin correct which dogs were there by hand, for a missed, odd or late booking.
- **Fix:** something shareable with the employee: what they're being paid and how it was calculated.
- **Maybe:** notify Charlie when her admin adds or changes boarding info.
- **Maybe:** a clear answer to "something looks wrong at 9pm, what do I do?" (Send a Question exists; make it obvious, and say what happens next).

## Open questions for Kate

1. What does Charlie's pay period look like, and how is she paying and recording today?
2. Does her admin have an account now? What do they do in the app?
3. Should the breakdown be printable, screenshot-friendly, or a link? (A link means an employee-facing page; see "who gets accounts".)
4. Who decides when a criterion is met: Charlie alone, or Charlie and Kate together?
