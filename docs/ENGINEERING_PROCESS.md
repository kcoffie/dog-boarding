# Engineering process: team gates

dog-boarding is built by one person directing an AI coding agent, for a real client (Q Boarding) who relies on it running unattended. A persona prompt ("you are a senior engineer") doesn't add expertise. A team works because the reviewer didn't write the code, checks happen at fixed moments, and rules are enforced by machines. This repo copies that structure (from the dash and dos projects, 2026-10). Each role is a **gate**: a moment, a mechanism, and what it blocks.

| Role | Gate (when) | Mechanism | Blocks |
|---|---|---|---|
| TPM | Start of every session | `docs/SESSION_HANDOFF.md` ("▶ START HERE"), `docs/SPRINT_PLAN.md`, `docs/REQUIREMENTS.md` | Scope creep, lost decisions, starting on a stale baseline |
| Architect | Before a new scheduled job, a new external service or secret, a new table, or a change to what gets sent to WhatsApp | A design note (below), then the `architect` agent (`.claude/agents/architect.md`) challenges it with fresh context | Choices that are expensive to undo; jobs that can fail silently |
| Reviewer | Before every PR is opened | The `reviewer` agent (fresh context, didn't write the code): correctness against REQUIREMENTS, then a **separate test audit**, then ops and security | Bugs, tests that test nothing, failures nobody hears about |
| QA | Every push and PR | CI (`ci.yml`): lint, `check:requirements`, tests, build. `npm run mutate` (Stryker, `mutation.yml` on main) measures whether the tests would notice a bug (below). After each merge, `npm run check:deploy` confirms production changed (REQ-654) | Regressions, weak tests, a merge that never reached production |
| Security | Before secrets go live, and in review | The design note's threat section: each secret's scope, where it lives, what a leak exposes. The repo is **public**: no keys, phone numbers or client data in code, tests, docs or commits | Leaked keys, over-broad tokens, client data on a public repo |
| Ops | In production, every scheduled run | **Target:** every scheduled job reports its **failure** to Kate (WhatsApp); auditing today's jobs against it is #239. **Silence is never success.** A check that runs on the same scheduler as the job it watches doesn't count (below) | A notification that quietly stops arriving |
| Kate's rules | Every commit and PR | `scripts/no-attribution.sh`, run by `.husky/commit-msg` and the `attribution` workflow (each PR's commits and description, re-run on edit) | AI attribution (Co-Authored-By, Claude-Session, session links). Claude Code's per-session reminder asks for these; it is overruled |
| Kate | Every merge, and every rule about what the client sees | Reads the test **names** and the real counts; merges PRs herself | A change that's correct in code but wrong for the client |

**What blocks a merge.** `main` has a ruleset (the repo is public) requiring Lint, Unit Tests, Requirements Coverage, Build and `no-attribution`. Claude never commits to `main`. Since 2026-10-16 Claude may open **and squash-merge** PRs, but only when every check is green (`command gh pr checks`) and the `reviewer` agent has run. Repo settings, secrets, and anything that sends a message still need Kate's OK each time.

**Scope: new code.** These gates fire on diffs, so they cover code written from 2026-10-16 on. Code written before that is brought up to the same bar by the backfill in issue #239 (mutation survivors per file, an Ops audit of every job, a reviewer pass per module, security, dependencies). Until that's done, a low score in an old file is a known gap, not a surprise.

## Design note (architect gate)
Half a page, in the PR description or `docs/specs/`: **problem → options (2–3) → choice and why → what breaks → threat → how we'll know it's working (and how we'll know when it isn't)**. The `architect` agent reviews it before code is written.

## Ops gate: silence is never success
The August 2026 outage is the reason for this gate. GitHub disabled all 8 scheduled workflows after 60 days without a commit (2026-08-24). Notifications stopped, and so did the cron health check, because it ran on the same GitHub scheduler. Then the Vercel sync crons kept reporting "success" while the detail queue backed up and boardings stopped updating (2026-09-26). Nothing alerted for seven weeks.

Rules for every scheduled job (GitHub Actions or Vercel cron):
1. **Failure is loud.** A failed run alerts Kate (`sendAlert`, Telegram — REQ-652), never just a log line or a red run nobody opens. An alert that can't be delivered fails the run in turn.
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
7. **No client data in tests.** Synthetic names and numbers only (the repo is public). CI's Lint job rejects realistic phone numbers and personal emails in every test file (`npm run check:test-pii`, REQ-653). It can't recognise a real name, so the reviewer checks names.

Every new requirement still gets an `@requirements REQ-XXX` annotation; `npm run check:requirements` enforces that a test exists. Mutation testing checks that it's a good one.

### The machine check: mutation testing
`npm run mutate` (Stryker, vitest runner, `stryker.config.json`) plants thousands of small bugs in the logic (flips `>` to `>=`, empties a string, forces a condition true), one at a time, and runs the tests against each. A bug that no test catches **survives**. The **mutation score** is the share caught. Line coverage only says code *ran*. This says the tests would *notice* if it broke.

- Scope: `api/`, `src/lib/` and `src/utils/` (the sync, notify and calculation logic). UI (`components`, `pages`, `hooks`, `context`) and `scripts/` are out for now; widening is part of #239.
- Report: `out/mutation.html` (survivors shown inline). `out/` is gitignored.
- Launch Stryker from the local install (`npm run mutate`, or `./node_modules/.bin/stryker run stryker.config.json`), never `npx` (without a local install it fetches an unrelated old package).
- **Running it locally:** keep the Mac awake (`caffeinate -dims`). A sleep mid-run turns test runs into timeouts, and Stryker counts timeouts as caught. `timeoutMS` is 20 s for the same reason. Read every Timeout before trusting a score.
- **Ratchet:** `thresholds.break` in `stryker.config.json` is set just below the last CI score on `main` (47). The `Mutation` workflow (`mutation.yml`) runs on every push to `main` and turns red below that. Raise it when the score goes up. **Never lower it to make a PR pass.**
- **Incremental on main (#298):** the last run's results are cached, and only mutants in changed source or test files run again. A full run (~55 min) happens when `package-lock.json` or `stryker.config.json` changes, every Monday 13:00 UTC, or by hand (`workflow_dispatch` with `full`). Incremental can't see a change outside the mutated and test files (a fixture, an out-of-scope helper), so trust Monday's full run over a mid-week score when they differ. A burst of merges runs once, on the newest commit. The score is still the whole scope's, so the score log and ratchet work as before.
- **New code bar (next):** a `mutate:changed` job that fails a PR when under 80% of the planted bugs in its changed lines are caught, as in dash and dos. Added once the full-run time on CI is known.
- **Survivors that change nothing:** skip them with `// Stryker disable next-line <Mutator>: <reason>`. The reviewer checks every reason.

## Score log

| Date | Score | Note |
|---|---|---|
| 2026-10-16 | **35.25% (2648 / 7512)** | Baseline, local, 10 workers, 4 m 24 s. 2637 killed / 11 timeout / 1866 survived / 2998 no coverage. All 11 timeouts read: genuine infinite loops (`i++` → `i--` in counting loops, a `push` loop whose bound flips). Untested (0%, no coverage): `notify.js` (354 mutants), `sync-proxy.js`, the three sync crons (`cron-auth`, `cron-schedule`, `cron-detail`), `run-sync.js`, `errorCategorization.js`, `historicalSync.js`. Strongest: `calculations.js` 98.6%, `dateUtils.js` 93%, `appointmentFilter.js` 84%. Covered-code score 58.66%. Ratchet → 35. Backfill: #239 |
| 2026-10-16 | **35.61% (2693 / 7562)** | First green CI run on `main` (#249, Node 22), 44 m 29 s. CI counts slightly more mutants than the local baseline. |
| 2026-10-16 | **37.83% (2981 / 7880)** | CI on `main` after ops-watch (#250); same score on the next two runs (28–48 min each). Ratchet → 37. |
| 2026-10-18 | **83.27% (468 / 562)** on the 5 files | #239 slice 1, local scoped run (`--mutate` notify + sync crons): `notify.js` 0 → 76.6%, `cron-auth` 0 → 95.3%, `cron-schedule` 0 → 98.5%, `cron-detail` 0 → 90.8% (`cron-detail-2` is a re-export: 0 mutants). 114 tests written from REQ-109/401/611/612/630/640/641. Of the 94 left, 65 only change log text; the rest are equivalent (`.catch` loggers, defaults that can't matter) or the Pacific-timezone option, which only CI (UTC) can kill. Full-run score: see the next CI run on `main`. |
| 2026-10-19 | **44.94% (3592 / 7993)** | CI on `main` after #261/#265 (4d6cc25, 41 m 38 s); the same on the next run (8e7aaef). 3581 killed / 11 timeout / 1960 survived / 2441 no coverage. All 11 timeouts are in pre-10-16 files (`roster-image` 3, `extraction` 4, one each in `notify-intraday`, `changeDetection`, `pictureOfDay`, `dateUtils`). The clear-text log doesn't list them; even if all were wrong the score would be 44.80%. Ratchet → 44. |
| 2026-10-19 | **82.45% (296 / 359)** on `syncRunner.js` | #239 slice 2, local scoped run in `TZ=UTC` (as CI): 35.67% (CI) → 82.45%. 62 tests written from the new REQ-109 "Shared runners" criteria; they pass in Pacific, UTC, Tokyo and New York. The review fixed two bugs: `cursorAdvancedTo` was a UTC date, and a thrown non-Error left the item stuck. Of the 63 left, 47 only change log text. The other 16 are equivalent: lowercasing before `/i` patterns, trimming already-trimmed titles, the empty-title default, `petIds?.[0]` on an always-present array, a catch that only logs, the `'appointment'` default, `!hrefMatch` after a regex that requires `href`, and the log-only `wrapped` and `resetCount` checks. Silent-failure gaps found on the way: #275. |
| 2026-10-19 | **47.02% (3760 / 7996)** | CI on `main`, the first runs after #276 (5cb12fd, 56 m; the same on 906f8b2). 3749 killed / 11 timeout / 1874 survived / 2362 no coverage. `syncRunner.js` 82.45% in CI, matching the local `TZ=UTC` run. Next targets by size: `pictureOfDay.js` 51.13% (135 survived, 59 no coverage), `notify.js` 77.72%. Ratchet → 47. |
| 2026-10-19 | **83.18% (737 / 886)** on 4 files | #278 (PR #292), local scoped run, TZ=UTC, vitest 4, 0 timeouts, 5.9 tests per mutant. `opsWatch.js` 100%, `cron-schedule.js` 98.5%, `syncRunner.js` 82.9%, `syncQueue.js` 68.8%. The new enqueue code's survivors are log text and the `$` anchor on the URL timestamp regex (equivalent for AGYD URLs); the rest of syncQueue's are the older dequeue/retry/reset functions (#239). |
| 2026-10-19 | **82.87% (866 / 1045)** on 6 files | #275 (PR #296), local scoped run, TZ=UTC, vitest 4, 0 timeouts, 5.7 tests per mutant. `syncSettingsRow.js` 100%, `opsWatch.js` 100%, `cron-schedule.js` 98.7%, `syncRunner.js` 83.6%, `syncQueue.js` 69.3%, `sessionCache.js` 61.5% → 71.8% after the query-shape tests (the remaining 19 are log text). **Don't run Stryker on vitest 5:** it runs 0 tests per mutant (stryker-js #6210; PR #285 is on hold). |
| 2026-10-19 | **47.94% (3863 / 8058)** | CI on `main` after #292 (#278), db4ae3d, 53 m 20 s, 9.5 tests per mutant. 3852 killed / 11 timeout / 1835 survived / 2360 no coverage. Up from 47.02%; ratchet stays 47. The last full run on every merge: from #298 on, main runs incrementally. |
