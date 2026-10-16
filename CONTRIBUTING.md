# Contributing

How work lands in this repo. The gates behind it (reviewer, architect, good tests, mutation score, Ops) are in [docs/ENGINEERING_PROCESS.md](docs/ENGINEERING_PROCESS.md).

## Branches
- `main` is production (Vercel deploys it). Changes land only through PRs, which Kate merges. Never commit to `main`.
- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<topic>`.
- Commit each working chunk (tests green) and push it right away.

## Commits
```
<type>: <description> (#issue)

<optional body: what and why>
```
Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Every commit references its GitHub issue. No `Co-Authored-By`, `Claude-Session`, session links or other AI attribution: `.husky/commit-msg` rejects them, and the `attribution` workflow checks every PR's commits and description.

## Before opening a PR
1. `npm run test:run`, `npm run lint`, `npm run check:requirements`, `npm run build`.
2. New behavior has a REQ in `docs/REQUIREMENTS.md` and a test written from it (good-tests rules).
3. Logic changed in `api/`, `src/lib/` or `src/utils/`: run `npm run mutate` and report the score.
4. A new or changed scheduled job: its failure alert and RUNBOOK entry are in the same PR (Ops gate).
5. Run the `reviewer` agent (`.claude/agents/reviewer.md`) and fix or answer its findings.

## Merging
Squash-merge, after every check is green (`command gh pr checks <n>`). Delete the branch afterwards.
