# UAT script: the first session with Charlie (draft, 2026-10-23)

**Status:** draft for Kate (#13). Not yet dry-run on production; the dry-run log is in Part D.
**Goes with:** `docs/UAT_PLAN.md` (why, who, acceptance criteria). This file is the "what to press" part.
**Who runs it:** Kate, sitting with Charlie (and later her admin). Charlie drives; Kate takes notes.

- **Part A:** Kate's checklist before the session.
- **Part B:** the script Charlie follows, one step at a time. **Do** what it says, check that **you should see** happens, and if it doesn't, follow **if not**.
- **Part C:** goal-only tasks, with no button names. They show whether Charlie can do the job without the script.
- **Part D:** the results tables, for the dry-run and the real session.

---

## Part A: before the session (Kate)

**Setup**
- [ ] The watch-first session (UAT plan step 1) is done, and Charlie's pay period is known.
- [ ] Charlie's account exists and she can sign in. Her admin's account exists too, or is planned for the next session (UAT plan, "Before UAT starts" 1). Before the admin signs in, decide what she may see: today every signed-in user sees and can change everything, including everyone's pay (REQ-005, #6).
- [ ] Invite Users is gone from Settings (#307), or Charlie is told to leave it alone (step 10).
- [ ] The UAT plan's minimum fix is in: a dog with no rate alerts Kate (#312 step 1). Until then, check the period's dogs on the Dogs page for a blank night rate before the session.
- [ ] This script was dry-run on production within the last week (Part D), and every finding there is fixed or written down.
- [ ] Today's roster came out on time (Kate's Telegram), so the data on screen is fresh.

**The expected answers, frozen before the session**
- [ ] Pick one past pay period from Charlie's spreadsheet. Write down, from the spreadsheet alone: the dogs on each night, and each person's nights and total pay. Keep it with the spreadsheet, out of the repo (it holds client and staff data).
- [ ] **Tolerance: $0.** Any difference between the app and the frozen answers is a finding, with a cause found later (UAT plan step 2), not a debate in the session.

**Ground rules (say these at the start)**
- Use Charlie's own device and browser, the one she'll really use.
- Think aloud: say what you're looking for and what you expect to happen.
- Kate doesn't coach. She helps only after Charlie has been stuck for about 2 minutes, and writes that down as a finding.
- The spreadsheet stays the way she pays until M2: 4 pay periods in a row paid from the app's numbers (`docs/SPRINT_PLAN.md`). If the app is down or Kate can't be reached, she uses the spreadsheet.
- What isn't live yet: the staff roster by phone (#260), the pay breakdown picture (#314), and fixing a wrong boarding yourself (#313).

**Acceptance criteria covered** (`docs/UAT_PLAN.md`)
| # | Criterion | Where |
|---|---|---|
| 1 | Each person's amount matches, or the difference is explained | Steps 4–5, Part C task 4 |
| 2 | A printable and phone-ready breakdown | Not in session 1: waits on #314 |
| 3 | A payment logged in under a minute; past payments answerable | Steps 7–8, Part C tasks 1–2 |
| 4 | The nights and dogs match what happened | Step 3 |
| 5 | Staff get the roster by phone | Not in session 1: waits on #260 |

---

## Part B: the script (Charlie)

The app: **https://qboarding.vercel.app**. It works on a laptop and on a phone. On a phone, the menu is the **☰** button at the top right.

### 1. Sign in
- **Do:** open the app, enter the email and password Kate gave you, press **Sign in**.
- **You should see:** the **Dashboard**, with "Overview of boarding schedule and revenue" under the title.
- **If not:** press **Forgot password?** and follow the email. Still stuck: text Kate.

### 2. Pick the week
- **Do:** on the Dashboard, use the date bar: the arrows move back and forward, **Today** comes back to now, and the two dates set the range. Set it to the pay period Kate names.
- **You should see:** the four cards at the top (**Dogs Tonight**, **Active Dogs**, **Nights Assigned**, **Period Revenue**) and the table below for those dates.

### 3. Read the table (criterion 4)
- **Do:** look down the dog rows and across the nights.
- **You should see:** one row per dog, and a mark on each night it stayed: overnight or **Day only**. Under the dogs, each night shows **Overnight**, **Gross**, **Net** and **Employee**. **A-Z** sorts dogs by name; clicking a date sorts by who's there that night.
- **Check:** compare two or three nights with Kate's frozen list. Same dogs, same nights?
- **If not:** don't change it in the app (the next sync puts it back). Kate writes it down; in real use, send a question (step 9) with the dog and the night.

### 4. Say who stayed each night
- **Do:** in the **Employee** row, pick who stayed each night. Pick **N/A** for nights you or your family stayed. If that person also worked the next day, tick **Day boarding** under their name.
- **You should see:** your choice stays after you reload the page, and **Nights Assigned** goes up.
- **Note for Kate:** time this. Is it less work than the spreadsheet?

### 5. Check what each person earned (criterion 1)
- **Do:** scroll down to **Employee Totals**.
- **You should see:** each person, their **Nights worked**, **Total earnings** and the dates.
- **Check:** does each total match Kate's frozen answers to the cent? Write down any difference. Kate finds the cause later; don't work it out now.
- **Kate asks:** "Would you trust this total enough to pay someone?" Write down her answer word for word.

### 6. Check a dog's rate
- **Do:** open **Dogs**, type a name in **Search dogs...**, and press **Edit** on that dog.
- **You should see:** its **Night Rate** and **Day Rate**. Press **Cancel** without changing anything.
- **If a rate is blank or wrong:** tell Kate. A blank rate counts as $0 toward that night's pay.

### 7. Pay someone and log it (criterion 3)
- **Do:** open **Payroll**. Set the date range to the pay period. Under **Outstanding Payments**, find the person and check **Total owed** and **Dates**. Press **Mark as Paid**.
- **You should see:** a box titled **Pay [name]**, with every night ticked. Untick any night you're not paying now. Check **Payment amount**, then press **Confirm Payment** once.
- **Then:** the person leaves **Outstanding Payments** (or shows only the nights you left out), and the payment appears in **Payment History**.
- **Note for Kate:** time it, from opening Payroll to the payment in the history. The criterion says under a minute.
- **If you made a mistake:** in **Payment History**, press **Delete** on that payment. Its nights go back to **Outstanding Payments**; do it again.

### 8. Answer a past question from the app (criterion 3)
- **Do:** Kate asks something like "did you pay [name] for the week of [date]?". Answer it from **Payment History** alone.
- **You should see:** **Employee**, **Date Range**, **Nights**, **Amount** and **Paid On** for each payment.

### 9. When something looks wrong: Send a Question
- **Do:** on a laptop, press your initial at the top right, then **Send a Question**. On a phone, press **☰**, then **Send a Question**. Type what's wrong (which dog, which night, what you expected) and press **Send**.
- **You should see:** **Sent!**, and the box closes.
- **If you see an error instead:** your question didn't go through. Text Kate.
- **What happens next:** Kate gets it on her phone straight away, with your email. She replies **the same day, by text or email**, and if something needs fixing, she says what and when.

### 10. Leave these alone for now
- **Settings → Invite Users** (until it's removed in #307): it makes codes that nothing accepts. Kate creates accounts.
- **Editing or deleting a boarding** on the Dogs page: the next sync overwrites it. Use Send a Question instead.
- **Sync** and **Sync Now:** the app syncs with the booking site on its own every night. If something's missing, send a question.

### 11. Feedback (15 minutes, after every pay period)
Kate asks, and writes down your words:
1. **Keep:** what do you like? What should never change?
2. **Fix:** what got in the way, or was confusing or wrong?
3. **Wish:** what else would you want it to do?

---

## Part C: goal-only tasks (end of session 1, or session 2)

Kate reads each task out and says nothing else. No button names, no pointing. Write down where Charlie goes first, how long it takes, and where she hesitates.

1. "Pay [name] for last week."
2. "Did we pay [name] for the [date]?"
3. "A dog's night rate changed. Fix it."
4. "[Name] says her pay looks short. Show her why." The breakdown (#314) isn't live yet. Today the answer is **Employee Totals** (nights and dates) plus the Dashboard's **Net** per night. Note how far that gets her: this is what #314 must fix.

---

## Part D: results

**Severity** (decided before the session):
- **Blocker:** wrong money or lost data.
- **Major:** she needs a workaround or Kate's help.
- **Minor:** cosmetic, or a hesitation that resolves itself.

**Go/no-go:** Kate decides, in consultation with Charlie (UAT plan). Any open blocker is a no-go.

### Real session
| Step / task | Pass / fail | Time | Hesitations or confusion | Her words | Severity |
|---|---|---|---|---|---|
| | | | | | |

### Dry-run (Kate's browser, on production, before Charlie sees it)
Anything that writes data needs Kate's OK first and is put back afterwards. Don't plant fake data on production: look for each edge case below in a real period instead.

| Step / check | Result | Notes |
|---|---|---|
| (not run yet) | | |

**Edge cases to find in real data:**
- [ ] A dog with a blank night rate
- [ ] A day-only stay
- [ ] A stay that spans two pay periods
- [ ] A dog whose rate changed mid-period: do the old nights keep the old rate?
- [ ] A person who has left: do they still show in Outstanding?
- [ ] A partial payment: are the nights left out still outstanding, at the right amount?
- [ ] A late pickup: which night does it count on?

**Failure paths to check:**
- [ ] Wrong password: a clear message, no crash.
- [ ] Delete a payment: its nights come back to Outstanding at the same amount.
- [ ] Reload in the middle of "Pay [name]": nothing is saved.
- [ ] Send a Question shows **Sent!** only when it's delivered (it returns an error otherwise; REQ-700).

**Code to confirm in the dry-run** (found while writing this script):
- **Unticking nights in "Pay [name]"** pays an average per-night amount × the ticked nights, not the sum of those nights (`src/components/PaymentDialog.jsx`). If nights pay different amounts, a partial payment is wrong.
- **A double-click on "Confirm Payment"** may record two payments: nothing disables the button while it saves (`PaymentDialog.jsx`, `handleConfirm`).
- **A failed save in "Confirm Payment"** only logs to the browser console; the box closes as if it worked (`src/pages/PayrollPage.jsx`, `confirmPayment`).

**Not supported, for watch-first:** one night split between two people (there's one Employee per night).
