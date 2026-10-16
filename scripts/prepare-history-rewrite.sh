#!/bin/sh
# Prepare (never push) a rewrite of main + tags that removes AI attribution lines from old commit messages.
# Kate approved the rewrite on 2026-10-16. Claude can't force-push main, so this builds and verifies the
# rewritten history in a fresh clone and prints the push command for Kate.
#
# Usage: sh scripts/prepare-history-rewrite.sh <empty-work-dir>
# Checks before printing the command: same commit count, every commit's tree/author/dates/subject unchanged,
# no attribution left (scripts/no-attribution.sh). Backup: ~/projs/qap/_salvage/dog-boarding-main-before-rewrite.bundle
set -eu
WORK=${1:?usage: prepare-history-rewrite.sh <empty-work-dir>}
HERE=$(cd "$(dirname "$0")" && pwd)
git clone -q https://github.com/kcoffie/dog-boarding.git "$WORK/rewrite"
cd "$WORK/rewrite"
OLD=$(git rev-parse main)
mkdir -p "$HOME/projs/qap/_salvage"
git bundle create "$HOME/projs/qap/_salvage/dog-boarding-main-before-rewrite.bundle" main --tags 2>/dev/null
git bundle verify "$HOME/projs/qap/_salvage/dog-boarding-main-before-rewrite.bundle" >/dev/null 2>&1
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter "python3 -I $HERE/strip-attribution.py" \
  --tag-name-filter cat -- main --tags >/dev/null 2>&1
[ "$(git rev-list --count "$OLD")" = "$(git rev-list --count main)" ] || { echo "commit count changed" >&2; exit 1; }
git log --format='%T %an %ae %ad %cd %s' "$OLD" > "$WORK/old.txt"
git log --format='%T %an %ae %ad %cd %s' main > "$WORK/new.txt"
cmp -s "$WORK/old.txt" "$WORK/new.txt" || { echo "a tree, author, date or subject changed" >&2; exit 1; }
git log main --format=%B | sh "$HERE/no-attribution.sh"
echo "Verified: $(git rev-list --count main) commits, identical trees/authors/dates/subjects, no attribution left."
echo "Kate runs:"
echo "  cd $WORK/rewrite && git push --force-with-lease=main:$OLD origin main && git push --force origin --tags"
