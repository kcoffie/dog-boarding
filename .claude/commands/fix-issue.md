---
description: Work on a GitHub issue with full tracking, testing, and documentation
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, TodoWrite
argument-hint: <issue-number> <branch> [additional-info-path]
---

# Fix Issue Workflow

Work on GitHub issue #$1 in branch `$2`.

## Parameters
- Issue number: $1
- Branch: $2
- Additional info: $3 (optional path to file with more context)

## Workflow Steps

### 0. Read Rules
- ALWAYS read `.claude/rules/commit-messages.md` first
- Follow all rules for commits and GitHub comments

### 1. Setup
- Switch to branch `$2` (create if needed, stash any uncommitted changes)
- Fetch issue details from https://github.com/kcoffie/dog-boarding/issues/$1
- If additional info path provided ($3), read that file for context

### 2. Create Work Document
- Create `docs/issue-$1-work.md` as the tracking document
- Include: issue title, problem statement, investigation log, todos
- Update this doc throughout the work

### 3. Track Progress
- Maintain a todo list in the work document
- Update status as work progresses

### 4. Investigation & Fix
- Investigate the issue thoroughly
- Document findings in the work document
- Implement the fix

### 5. Testing
- Create or update tests that verify the fix works
- Run tests to confirm fix
- Document test results in work document

### 6. Documentation Updates
- If requirements changed: update `docs/REQUIREMENTS.md`
- If test data changed: update `docs/TEST-DATA.md`
- Update `docs/TODO.md` if needed

### 7. Commits
- Commit changes with messages referencing issue #$1
- Do NOT mention Claude in commit messages
- Push to branch `$2`
- Link commits to the issue

### 8. Summaries
At completion, prepare two summaries in the work document:

**Short Summary:**
- Problem, root cause, fix, verification (1 paragraph)

**Detailed Engineering Summary:**
- Investigation timeline
- Root cause analysis
- Resolution steps
- Files changed with descriptions
- How to verify changes are safe
- Related issues

### 9. Post Summaries to GitHub
- ASK USER before posting to GitHub
- Add comment to issue #$1 with:
  1. Short summary (first)
  2. Detailed engineering summary (second)
- After user confirms summaries are posted, ask if issue should be closed

## Rules
- ALWAYS read `.claude/rules/commit-messages.md` at start of workflow
- Never mention Claude/AI in commits or issue comments (see rules file)
- Always ask before posting to GitHub issues
- Keep work document updated throughout
- Test before committing
