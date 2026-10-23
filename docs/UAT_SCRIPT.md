# UAT script: the first session with Charlie (draft, 2026-10-23)

**Status:** draft for Kate (#13). Not yet dry-run on production; the dry-run log is at the end.
**Goes with:** `docs/UAT_PLAN.md` (why, who, acceptance criteria). This file is the "what to press" part.
**Who runs it:** Kate, sitting with Charlie (and later her admin). Charlie drives; Kate takes notes.

Part A is Kate's checklist. Part B is the script Charlie follows, one step at a time: **Do** what it says, check that **you should see** happens, and if it doesn't, follow **if not**. Part C is the dry-run log.

---

## Part A: before the session (Kate)

- [ ] The watch-first session (UAT plan step 1) is done, and Charlie's pay period is known.
- [ ] Charlie's account exists and she can sign in. Her admin's account exists too, or is planned for the next session (UAT plan, "Before UAT starts" 1).
- [ ] The UAT plan's minimum fix is in: a dog with no rate alerts Kate (#312 step 1). Until then, before the session, check the period's dogs on the Dogs page for a blank night rate.
- [ ] This script was dry-run on production within the last week (Part C), and every "if not" found there is fixed or written down.
- [ ] Today's roster came out on time (Kate's Telegram), so the data on screen is fresh.
- [ ] Say up front what isn't live yet: the staff roster by phone (#260), the pay breakdown picture (#314), and fixing a wrong boarding yourself (#313).

---

## Part B: the script (Charlie)

The app: **https://qboarding.vercel.app**. It works on a laptop and on a phone. On a phone, the menu is the **☰** button at the top right.

### 1. Sign in
- **Do:** open the app, enter the email and password Kate gave you, press **Sign in**.
- **You should see:** the **Dashboard**, with "Overview of boarding schedule and revenue" under the title.
- **If not:** press **Forgot password?** and follow the email. Still stuck: text Kate.

### 2. Pick the week
- **Do:** on the Dashboard, use the date bar: the arrows move back and forward, **Today** comes back to now, and the two dates set the range. Set it to last week.
- **You should see:** the four cards at the top (**Dogs Tonight**, **Active Dogs**, **Nights Assigned**, **Period Revenue**) and the table below for those dates.

### 3. Read the table
- **Do:** look down the dog rows and across the nights.
- **You should see:** one row per dog, and a mark on each night it stayed: overnight or **Day only**. Under the dogs, each night shows **Overnight**, **Gross**, **Net** and **Employee**. **A-Z** sorts dogs by name; clicking a date sorts by who's there that night.
- **Check (criterion 4):** pick two or three nights and compare the dogs with the booking site. Same dogs, same nights?
- **If not:** don't change it in the app (the next sync puts it back). Send Kate a question (step 9) with the dog and the night.

### 4. Say who stayed each night
- **Do:** in the **Employee** row, pick who stayed each night. Pick **N/A** for nights you or your family stayed. If that person also worked the next day, tick **Day boarding** under their name.
- **You should see:** your choice stays after you reload the page, and **Nights Assigned** goes up.
- **Note for Kate:** time this. Is it less work than the spreadsheet?

### 5. Check what each person earned
- **Do:** scroll down to **Employee Totals**.
- **You should see:** each person, their **Nights worked**, **Total earnings** and the dates.
- **Check (criterion 1):** does each total match the spreadsheet for the same nights? Write down any difference. Kate finds the cause later; don't work it out now.

### 6. Check a dog's rate
- **Do:** open **Dogs**, type a name in **Search dogs...**, and press **Edit** on that dog.
- **You should see:** its **Night Rate** and **Day Rate**. Press **Cancel** without changing anything.
- **If a rate is blank or wrong:** tell Kate. A blank rate counts as $0 toward that night's pay.

### 7. Pay someone and log it (criterion 3)
- **Do:** open **Payroll**. Set the date range to the pay period. Under **Outstanding Payments**, find the person and check **Total owed** and **Dates**. Press **Mark as Paid**.
- **You should see:** a box titled **Pay [name]**, with every night ticked. Untick any night you're not paying now. Check **Payment amount**, then press **Confirm Payment**.
- **Then:** the person leaves **Outstanding Payments** (or shows only the nights you left out), and the payment appears in **Payment History**.
- **Note for Kate:** time it, from opening Payroll to the payment in the history. The criterion says under a minute.
- **If you made a mistake:** in **Payment History**, press **Delete** on that payment and do it again.

### 8. Answer a past question from the app (criterion 3)
- **Do:** Kate asks something like "did you pay [name] for the week of [date]?". Answer it from **Payment History** alone.
- **You should see:** **Employee**, **Date Range**, **Nights**, **Amount** and **Paid On** for each payment.

### 9. When something looks wrong: Send a Question
- **Do:** on a laptop, press your initial at the top right, then **Send a Question**. On a phone, press **☰**, then **Send a Question**. Type what's wrong (which dog, which night, what you expected) and press **Send**.
- **You should see:** **Sent!**, and the box closes.
- **If you see an error instead:** your question didn't go through. Text Kate.
- **What happens next:** Kate gets it on her phone straight away, with your email. She replies within **[Kate: how soon, and by text or email?]**, and if something needs fixing, she says what and when.

### 10. Leave these alone for now
- **Settings → Invite Users:** it makes codes that nothing accepts (#307). Kate creates accounts.
- **Editing or deleting a boarding** on the Dogs page: the next sync overwrites it. Use Send a Question instead.
- **Sync** and **Sync Now:** the app syncs with the booking site on its own every night. If something's missing, send a question.

### 11. Feedback (15 minutes, after every pay period)
Kate asks, and writes down your words:
1. **Keep:** what do you like? What should never change?
2. **Fix:** what got in the way, or was confusing or wrong?
3. **Wish:** what else would you want it to do?

---

## Part C: dry-run log

The dry-run runs Part B on production, in Kate's browser, before Charlie sees it. Anything that writes data needs Kate's OK first and is put back afterwards.

| Step | Result | Notes |
|---|---|---|
| (not run yet) | | |

Code to check during the dry-run, found while writing this script:
- **Unticking nights in "Pay [name]"** pays an average per-night amount × the ticked nights, not the sum of those nights (`src/components/PaymentDialog.jsx`). If nights pay different amounts, a partial payment is wrong.
- **A failed save in "Confirm Payment"** only logs to the browser console; the box closes as if it worked (`src/pages/PayrollPage.jsx`, `confirmPayment`).
