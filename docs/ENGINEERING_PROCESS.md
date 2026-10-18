# Engineering process: team gates

dog-boarding is built by one person directing an AI coding agent, for a real client (Q Boarding) who relies on it running unattended. A persona prompt ("you are a senior engineer") doesn't add expertise. A team works because the reviewer didn't write the code, checks happen at fixed moments, and rules are enforced by machines. This repo copies that structure (from the dash and dos projects, 2026-10). Each role is a **gate**: a moment, a mechanism, and what it blocks.

| Role | Gate (when) | Mechanism | Blocks |
|---|---|---|---|
| TPM | Start of every session | `docs/SESSION_HANDOFF.md` ("▶ START HERE"), `docs/SPRINT_PLAN.md`, `docs/REQUIREMENTS.md` | Scope creep, lost decisions, starting on a stale baseline |
| Architect | Before a new scheduled job, a new external service or secret, a new table, or a change to what gets sent to WhatsApp | A design note (below), then the `architect` agent (`.claude/agents/architect.md`) challenges it with fresh context | Choices that are expensive to undo; jobs that can fail silently |
| Reviewer | Before every PR is opened | The `reviewer` agent (fresh context, didn't write the code): correctness against REQUIREMENTS, then a **separate test audit**, then ops and security | Bugs, tests that test nothing, failures nobody hears about |
| QA | Every push and PR | CI (`ci.yml`): lint, `check:requirements`, tests, build. `npm run mutate` (Stryker) measures whether the tests would notice a bug (below) | Regressions, weak tests |
| Security | Before secrets go live, and in review | The design note's threat section: each secret's scope, where it lives, what a leak exposes. The repo is **public**: no keys, phone numbers or client data in code, tests, docs or commits | Leaked keys, over-broad tokens, client data on a public repo |
| Ops | In production, every scheduled run | **Target:** every scheduled job reports its **failure** to Kate (WhatsApp); auditing today's jobs against it is #239. **Silence is never success.** A check that runs on the same scheduler as the job it watches doesn't count (below) | A notification that quietly stops arriving |
| Kate's rules | Every commit and PR | `scripts/no-attribution.sh`, run by `.husky/commit-msg` and the `attribution` workflow (each PR's commits and description, re-run on edit) | AI attribution (Co-Authored-By, Claude-Session, session links). Claude Code's per-session reminder asks for these; it is overruled |
| Kate | Every merge, and every rule about what the client sees | Reads the test **names** and the real counts; merges PRs herself | A change that's correct in code but wrong for the client |

**What blocks a merge.** `main` has a ruleset (the repo is public) requiring Lint, Unit Tests, Requirements Coverage and Build. `no-attribution` isn't a required check until Kate adds it to the ruleset, so today it blocks by rule, not mechanically. Claude never commits to `main`, never calls a PR ready while a check is red (`command gh pr checks`), and Kate merges.

**Scope: new code.** These gates fire on diffs, so they cover code written from 2026-10-16 on. Code written before that is brought up to the same bar by the backfill in issue #239 (mutation survivors per file, an Ops audit of every job, a reviewer pass per module, security, dependencies). Until that's done, a low score in an old file is a known gap, not a surprise.

## Design note (architect gate)
Half a page, in the PR description or `docs/specs/`: **problem → options (2–3) → choice and why → what breaks → threat → how we'll know it's working (and how we'll know when it isn't)**. The `architect` agent reviews it before code is written.

## Ops gate: silence is never success
The August 2026 outage is the reason for this gate. GitHub disabled all 8 scheduled workflows after 60 days without a commit (2026-08-24). Notifications stopped, and so did the cron health check, because it ran on the same GitHub scheduler. Then the Vercel sync crons kept reporting "success" while the detail queue backed up and boardings stopped updating (2026-09-26). Nothing alerted for seven weeks.

Rules for every scheduled job (GitHub Actions or Vercel cron):
1. **Failure is loud.** A failed run alerts Kate (`getAlertRecipients()`), never just a log line or a red run nobody opens.
2. **Check outcomes, not runs.** "The cron ran" isn't health. Check what the client depends on: data freshness, queue depth, a message actually delivered.
3. **The watcher runs somewhere else.** A health check that shares the scheduler of the job it watches dies with it. **Not true yet (2026-10-16):** every watcher still runs on GitHub. `keepalive.yml` (#236, best effort) and ops-watch on a Vercel cron (#237, designed, blocked on decisions) close this gap.
4. **A new job comes with its alert** in the same PR, and its runbook entry in `docs/RUNBOOK.md`.

## Good tests, not just tests
Tests are only worth relying on if a broken rule makes one fail. These rules make that checkable:

1. **Expected values come from the spec, not the code.** Work the answer out from `docs/REQUIREMENTS.md` (the REQ's acceptance criteria) by hand ("checked in 5/1, out 5/4 → 3 nights"). Never run the code and paste its output into the assertion. That just records today's behavior, bugs included.
2. **Every test is seen failing once.** Break the rule in the code, watch the test go red, then put the code back. The mutation run does this at scale.
3. **Assert the exact value.** `expect(nights).toBe(3)`, not `toBeTruthy()`. An existence check passes for almost any bug.
4. **One rule per test, named as the rule** ("a DC-only title is not a boarding"). The test list then reads as the spec, so Kate can review it without reading code.
5. **No snapshots.** Never assert a whole object, HTML page or message body against pasted output: it kills mutants (raising the score) while locking in today's bugs. Assert the one value the rule is about.
6. **Fake only the boundaries.** AGYD HTML, Supabase, Meta's WhatsApp API and Gmail get recorded real response shapes. Never mock the parser, filter, or mapper under test.
7. **No client data in tests.** Synthetic names and numbers only (the repo is public).

Every new requirement still gets an `@requirements REQ-XXX` annotation; `npm run check:requirements` enforces that a test exists. Mutation testing checks that it's a good one.

### The machine check: mutation testing
`npm run mutate` (Stryker, vitest runner, `stryker.config.json`) plants thousands of small bugs in the logic (flips `>` to `>=`, empties a string, forces a condition true), one at a time, and runs the tests against each. A bug that no test catches **survives**. The **mutation score** is the share caught. Line coverage only says code *ran*. This says the tests would *notice* if it broke.

- Scope: `api/`, `src/lib/` and `src/utils/` (the sync, notify and calculation logic). UI (`components`, `pages`, `hooks`, `context`) and `scripts/` are out for now; widening is part of #239.
- Report: `out/mutation.html` (survivors shown inline). `out/` is gitignored.
- Launch Stryker from the local install (`npm run mutate`, or `./node_modules/.bin/stryker run stryker.config.json`), never `npx` (without a local install it fetches an unrelated old package).
- **Running it locally:** keep the Mac awake (`caffeinate -dims`). A sleep mid-run turns test runs into timeouts, and Stryker counts timeouts as caught. `timeoutMS` is 20 s for the same reason. Read every Timeout before trusting a score.
- **Ratchet:** `thresholds.break` in `stryker.config.json` is set just below the last CI score on `main` (37). CI's `mutation` job runs the whole scope on every push to `main` and turns it red below that. Raise it when the score goes up. **Never lower it to make a PR pass.**
- **New code bar (next):** a `mutate:changed` job that fails a PR when under 80% of the planted bugs in its changed lines are caught, as in dash and dos. Added once the full-run time on CI is known.
- **Survivors that change nothing:** skip them with `// Stryker disable next-line <Mutator>: <reason>`. The reviewer checks every reason.

## Score log

| Date | Score | Note |
|---|---|---|
| 2026-10-16 | **35.25% (2648 / 7512)** | Baseline, local, 10 workers, 4 m 24 s. 2637 killed / 11 timeout / 1866 survived / 2998 no coverage. All 11 timeouts read: genuine infinite loops (`i++` → `i--` in counting loops, a `push` loop whose bound flips). Untested (0%, no coverage): `notify.js` (354 mutants), `sync-proxy.js`, the three sync crons (`cron-auth`, `cron-schedule`, `cron-detail`), `run-sync.js`, `errorCategorization.js`, `historicalSync.js`. Strongest: `calculations.js` 98.6%, `dateUtils.js` 93%, `appointmentFilter.js` 84%. Covered-code score 58.66%. Ratchet → 35. Backfill: #239 |
| 2026-10-16 | **35.61% (2693 / 7562)** | First green CI run on `main` (#249, Node 22), 44 m 29 s. CI counts slightly more mutants than the local baseline. |
| 2026-10-16 | **37.83% (2981 / 7880)** | CI on `main` after ops-watch (#250); same score on the next two runs (28–48 min each). Ratchet → 37. |
| 2026-10-18 | **83.27% (468 / 562)** on the 5 files | #239 slice 1, local scoped run (`--mutate` notify + sync crons): `notify.js` 0 → 76.6%, `cron-auth` 0 → 95.3%, `cron-schedule` 0 → 98.5%, `cron-detail` 0 → 90.8% (`cron-detail-2` is a re-export: 0 mutants). 114 tests written from REQ-109/401/611/612/630/640/641. Of the 94 left, 65 only change log text; the rest are equivalent (`.catch` loggers, defaults that can't matter) or the Pacific-timezone option, which only CI (UTC) can kill. Full-run score: see the next CI run on `main`. |
