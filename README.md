# Pawroll

A dog boarding operations platform: daily rosters that run unattended, and per-night payroll calculation. Developed with Claude Code. I own the product and its engineering: the requirements, the architecture decisions and the quality gates.

The business books through a third-party site with no API or webhooks. This system reads that site multiple times a day, keeps its own database in step, sends the morning roster on schedule, and works out what each employee would be owed per night. Most of the engineering is in making that reliable when the data source can change without notice, and in making sure a failure is never silent.

| | |
|---|---|
| Tests | Thousands, judged by mutation testing rather than by count |
| Mutation score | Most planted bugs caught, with a minimum enforced in CI |
| Scheduled jobs | Vercel crons and GitHub Actions workflows |
| Decisions and schema | Architecture decision records and versioned SQL migrations |
| Stack | JavaScript, React, Vite, Tailwind, Supabase (Postgres), Vercel, GitHub Actions, Playwright, Vitest, Stryker |

## How it works

```mermaid
graph TD
    SITE[Booking site: no API]

    subgraph "Vercel crons"
        AUTH[cron-auth: session]
        SCHED[cron-schedule: find bookings, cancel removed ones]
        DETAIL[cron-detail: read booking pages]
        NOTIFY[notify: rosters]
        WATCH[ops-watch: daily check on the outcomes]
    end

    subgraph "GitHub Actions"
        IC[Integration Check: site vs database]
        HEALTH[cron-health-check]
        GMAIL[gmail-monitor: failure emails]
    end

    DB[(Postgres)]
    APP[React app: dashboard, calendar, payroll]
    ALERT[Telegram: alerts and rosters]

    SITE --> AUTH & SCHED & DETAIL
    SCHED -->|queue| DB
    DETAIL --> DB
    DB --> NOTIFY --> ALERT
    DB --> APP
    SITE --> IC --> DB
    DB --> WATCH --> ALERT
    IC & HEALTH & GMAIL --> ALERT
```

- **Sync.** Nightly crons refresh the login session, read the schedule pages to queue bookings, and read each booking's page into Postgres. A booking gone from the site is confirmed by opening its own page, and only then cancelled ([ADR-010](docs/adr/010-removed-bookings-cancelled-nightly.md)).
- **The booking site is the source of truth.** Dogs, rates and bookings can't be edited in the app. A difference is a bug to fix at the source or in the sync.
- **Rosters.** Crons fire in every UTC hour a roster could fall in, and the code reads the Pacific clock to choose the window, so daylight saving needs no edits. Each window claims its day in one atomic database update, so a duplicate delivery sends once ([ADR-004](docs/adr/004-rosters-on-vercel-crons-with-claim-rows.md)). The roster image is rendered on the server with satori and resvg.
- **Pay.** A single function, `nightStays`, decides each night's dogs and money for the Dashboard, Calendar and Payroll, so those screens agree on every night's figures.
- **Dates.** The business is in San Francisco, so every date and time in the app is San Francisco time, whatever the device. One module reads booking times, and a guard test catches local-zone formatting in files that handle them ([ADR-009](docs/adr/009-booking-times-are-site-clock-times.md)).

## What broke, and what changed

Each of these shaped how the system or the process works.

| What happened | How it was found | What changed |
|---|---|---|
| **Seven silent weeks.** GitHub disabled all 8 scheduled workflows after 60 days without a commit. Notifications stopped, and so did the health check, because it ran on the same scheduler. Later the sync crons kept reporting "success" while bookings stopped updating. | Not by any check: nothing alerted | The Ops rules below: alert on failure, check outcomes rather than runs, and watch from a different scheduler |
| **Wrong dog identity.** The server followed a redirect from a hidden booking to the week's schedule and read that page as the booking. That gave dogs another pet's ID, renamed one dog, and created empty dog rows. | Pet IDs that didn't match, traced through the logs and tables | Pages are read without following redirects; a redirected page writes nothing. A dog is its pet ID, enforced by a unique index, and the sync never renames one ([ADR-008](docs/adr/008-dog-identity-is-the-pet-id.md)) |
| **Two answers for the same night.** Eight copies of the nightly calculation had drifted apart: one night showed $338 on the Dashboard and $286 in Payroll. | A step-by-step manual walkthrough of the app on production data | One shared function, with expected values worked out by hand |
| **Times 7–8 hours off.** The site's times are Pacific clock times stored as if they were UTC, so a 10:15am pick-up showed as 3:15am. | A person reading the roster | Stored values kept, with one reader for all of them and a guard test ([ADR-009](docs/adr/009-booking-times-are-site-clock-times.md)) |
| **Removed bookings stayed on the roster and in the pay figures.** Only a manual sync noticed them. | Bookings removed on the site were still in the app | Nightly check, with a report-only first night checked by hand before it went live ([ADR-010](docs/adr/010-removed-bookings-cancelled-nightly.md)) |
| **Payroll bugs.** Partial payments were averaged per night ($159.25 instead of $139.75), and a double-click recorded two payments 283 ms apart. Both appeared on test payments, since deleted. | The same walkthrough, this time making the writes by hand | The chosen fix: each night keeps its own amount, with a database guard against paying a night twice |

## How it's tested

Test counts don't show whether tests would catch a bug, so the measure here is mutation testing. [Stryker](https://stryker-mutator.io/) plants thousands of small bugs in the sync, notification and calculation logic, and counts how many make a test fail. CI runs it on `main` and fails below a threshold that the process says is never lowered to make a PR pass. UI components are outside the score for now, so the score is for that logic only, and older code is still being brought up to the bar. New changes are run against their changed lines, and those results are in the [score log](docs/ENGINEERING_PROCESS.md#score-log).

The rules for tests ([full list](docs/ENGINEERING_PROCESS.md#good-tests-not-just-tests)):

- Expected values come from the requirement, worked out by hand, never pasted from the code's output.
- Every test is seen failing once.
- One rule per test, named as the rule, so a non-programmer can review the list.
- No snapshots. Only external boundaries are faked, using recorded response shapes.
- Booking-time logic is tested in time zones chosen to expose a wrong date (Kiritimati, Pago Pago), not only the developer's.

## How it's built

This is developed with Claude Code. I decide what gets built and how it's judged: the requirements, the choice between design options, the rules users see, and the gates below. An agent's confidence isn't evidence, so I run this the way I'd run a team: the reviewer didn't write the code, checks happen at fixed moments, and machines enforce the rules ([full process](docs/ENGINEERING_PROCESS.md)).

| Gate | When | How |
|---|---|---|
| Architect | Before a new job, service, secret or table | A half-page design note (options, what breaks, threat, how we'll know it's working), challenged by an agent with fresh context; the decision becomes an ADR |
| Reviewer | Before every PR | A fresh-context agent checks correctness against the requirements, then audits the tests, then ops and security |
| QA | Every push and PR | Required checks for lint, requirement coverage, tests and build; mutation score on `main`; a post-merge check that production changed |
| Security | Before secrets go live, and in review | Each secret's scope and leak impact are written down; CI rejects realistic phone numbers and emails in tests |
| Ops | Every scheduled run | Rules below |
| Owner (me) | Every rule users see | I decide those rules, run all production SQL, and approve anything that sends a message |

The fresh-context review earns its place. On the Friday roster change, the reviewer found that a window comparison was matching timestamps as text (`+00:00` against `.000Z`), which would have dropped every booking exactly at the start hour.

### Ops rules: silence is never success

These are the rules for new jobs. Auditing the older jobs against them is still open, and some of those only show a red run.

1. **Failure is loud.** A failed job alerts on Telegram, and an alert that can't be delivered fails the run in turn.
2. **Check outcomes, not runs.** "The cron ran" isn't health. Data freshness, queue depth and delivered messages are.
3. **The watcher runs somewhere else.** A check on the same scheduler as its job dies with it, so ops-watch runs on Vercel and checks the last successful run of GitHub's main jobs.
4. **A new job ships with its alert** and its runbook entry, in the same PR.

## Known gaps

- A cron can start late in its hour. GitHub's schedules can run hours late, which is why the rosters moved to Vercel.
- A sync redesign is under way to replace the overlapping nightly paths and cap requests to the booking site.
- The older ADRs and some docs in `docs/` are working records, not polished write-ups. Some decisions already shipped are still to be written up as ADRs.

## Running it locally

```bash
git clone https://github.com/kcoffie/dog-boarding.git
cd dog-boarding
npm install
cp .env.example .env.local   # add your Supabase credentials
npm run dev                  # app only; API routes need `npx vercel dev`
npm run test:run             # the test suite
npm run mutate               # mutation testing (a full run takes about an hour on CI)
```

To set up a database, run `supabase/schema.sql`, then the migrations in `supabase/migrations/` in order.

## License

MIT
