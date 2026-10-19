# Lessons learned: deploy and CI budget (dog-boarding, October 2026)

**For:** any project that is one person plus an AI coding agent, on Vercel Hobby and GitHub Actions, with mutation testing and Dependabot. Each lesson gives what happened, the fix, and a question to check whether your project has the same problem. Issue #298, PR "Deploy and CI budget".

## The short version
| Problem | Fix | Where |
|---|---|---|
| Every branch push built a Vercel preview. The daily limit ran out and merges to `main` stopped reaching production, silently | `git.deploymentEnabled` in `vercel.json`: only `main` (and opt-in `preview/**`) deploys | `vercel.json` |
| A green PR was taken to mean "it's live" | `npm run check:deploy` after every merge: waits for the Vercel status on that commit, then checks production answers | `scripts/check-deploy.js`, `src/lib/deployCheck.js` |
| The mutation job took 44–58 min against a 60-min timeout, on every merge (docs too) | Stryker incremental mode with a cached results file; full run weekly and when dependencies change; bursts cancel older runs | `.github/workflows/mutation.yml` |
| Dependabot opened 4–8 PRs a week whose lockfiles conflicted, so each merge meant a rebase, a CI run and a wait | Monthly; all dev dependencies in one PR; known-bad majors held in `ignore` with an issue link | `.github/dependabot.yml` |

---

## 1. Vercel Hobby's deploy limit is a production outage waiting to happen
**What happened (2026-10-19).** Hobby allows 100 deployments a day. Every push to every branch built a preview, on **two** Vercel projects connected to the same repo (one a forgotten duplicate). A history rewrite force-pushed 78 branches. Vercel answered every later deploy with "Deployment rate limited — retry in 24 hours", **including the merge to `main`**. All PR checks were green, and production stayed a day behind.

**What we learned:**
- **A rate-limited deploy is never retried.** Production changes only on the next push to `main` after the window resets.
- **An Ignored Build Step (`ignoreCommand`) does not save quota.** Vercel's docs: canceled builds "will still count towards your deployment quotas". It only saves build minutes. (I suggested it first; the docs said otherwise.)
- **`git.deploymentEnabled` does save quota.** A disabled branch doesn't trigger a deployment at all. It takes minimatch globs, and when several rules match, any `true` wins:
  ```json
  "git": { "deploymentEnabled": { "**": false, "main": true, "preview/**": true } }
  ```
  Vercel reads it from the pushed commit's `vercel.json`, so the PR that adds it still builds once.
- **Side effect worth having:** the Vercel check disappears from PRs, so a quota problem can't make a PR look red, and PR CI's own `Build` job already proves the app builds.
- **A duplicate Vercel project doubles every build.** Check the Vercel dashboard for more than one project on the same repo.
- **A merge commit on `main` can have no production status at all.** Ours (#283) had none, while the PR's head commit had "Deployment has completed". We didn't find out why. Check the status on the exact `main` SHA, and treat "no status" as "not confirmed", never as "fine".

**Does this apply to you?** Are you on Hobby? Does every branch build a preview? Does anyone look at the previews? How many Vercel projects point at the repo? Have you ever pushed many branches at once (rewrite, bulk rebase, bot)?

## 2. "Merged" isn't "deployed": check production after every merge
**What happened.** A merge's PR checks were green; production didn't change, and nothing said so. It was noticed only by reading the commit status on `main` by hand.

**Fix.** `npm run check:deploy [sha]` (REQ-654) polls the commit's `Vercel – <project>` status:
- `success` → it checks the home page is 200 and one real API endpoint returns what it should (here, the roster image: 200 `image/png`).
- `failure`/`error` → it fails at once with Vercel's description.
- No status or still `pending` → it times out after 10 min, saying what it was last waiting for.

The rules are a pure module with tests (100% mutation score). The script only does the network calls. The newest status wins, because Vercel posts `pending` and then `success` on the same commit.

**Does this apply to you?** After a merge, how do you know production changed? Is there one endpoint whose failure would mean "the deploy broke" (in our case a dependency bump once crashed the image function on load)?

## 3. Make full mutation runs the exception, not every merge
**What happened.** Stryker over ~8,000 mutants took 44–58 min on CI, against a 60-min timeout, on every push to `main`, docs-only merges included. One more backfill slice would have timed it out and turned `main` red for a reason that has nothing to do with quality.

**Fix.** Stryker's `--incremental` with `--incrementalFile`, cached with `actions/cache`:
- The cache key holds a hash of `package-lock.json` and `stryker.config.json`, so a dependency or config change starts a full run. That matters: a test-runner bump once made every mutant run 0 tests (lesson 5).
- The key ends in `run_id` and is restored by prefix, because cache entries are immutable.
- Results are saved even when the ratchet fails: they're still correct, and the next run reuses them.
- A weekly full run (scheduled), plus a manual `full` input. Incremental mode can't see changes outside the mutated and test files (fixtures, helpers outside the mutate scope), so the weekly run is the backstop.
- `concurrency` with `cancel-in-progress` for pushes, so five quick merges cost one run.
- **Measured locally on one file:** 175 of 179 results reused; 16 s → 2 s; same score.

**Does this apply to you?** How long does your mutation (or other slow) job take, against what timeout? Does it run on docs-only merges? Is your score the whole scope, or just the diff?

## 4. Fewer Dependabot PRs, not faster ones
**What happened.** Weekly npm updates, each major in its own PR. Four dev-dependency majors arrived together. Their lockfiles conflicted, so they had to be merged in order, with `@dependabot rebase` and a full CI wait between each, and each one used a preview deploy.

**Fix:**
- `interval: monthly`.
- **One group for all dev dependencies, majors included** (one lockfile, one CI run, one merge).
- Production minor/patch grouped. Production majors stay one per PR, so each can be checked in production alone.
- GitHub Actions grouped into one PR.
- **Majors known to break go in `ignore` with `update-types: ["version-update:semver-major"]` and a comment linking the issue.** Otherwise one bad major turns the whole grouped PR red. Take them off the list when the issue is fixed.
- Build tools are dev dependencies but shape the production bundle. Run the deploy check after merging them anyway.

**Does this apply to you?** How many Dependabot PRs did you merge last month, and how many needed a rebase? Is a known-bad major (that you keep closing) sitting in your queue?

## 5. Traps that look green until much later
- **A test-runner upgrade can zero your mutation score while every test passes.** vitest 5 with `@stryker-mutator/vitest-runner` 10.0.0 runs **0 tests per mutant** (stryker-js #6210). PR CI stays green; only the main-branch mutation run shows it. Before any test-runner bump, run a scoped `stryker run --mutate <one file>` and confirm "tests per mutant" > 0.
- **`git grep` / `git ls-files` checks skip untracked files.** A repo-wide check run before `git add` passes falsely. Stryker also runs tests from an untracked sandbox (`.stryker-tmp/`), so a vitest test that shells out to git sees nothing there. Keep git-based checks in CI steps, not in tests.
- **A timeout counts as "killed" in mutation testing.** Read every timeout before trusting a score. Ours were genuine infinite loops, but a laptop going to sleep mid-run produces fake ones.
- **Vercel Hobby crons run at most once a day.** "Verify the next scheduled run after a change" can mean waiting a day, so batch the changes that need it.

## Checklist to copy into another project
- [ ] `vercel.json`: `git.deploymentEnabled` with `"**": false, "main": true` (plus an opt-in preview pattern if you use previews)
- [ ] Only one Vercel project connected to the repo
- [ ] A post-merge deploy check: the commit's Vercel status, then one real endpoint in production
- [ ] Slow CI jobs on `main`: incremental or cached, `concurrency` to collapse bursts, a timeout with headroom, and a periodic full run
- [ ] Dependabot: monthly, dev dependencies grouped (majors included), Actions grouped, known-bad majors ignored with an issue link
- [ ] After any test-runner bump: check "tests per mutant" > 0
- [ ] Never mass-push branches without checking the deploy quota first
