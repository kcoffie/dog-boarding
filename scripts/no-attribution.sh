#!/bin/sh
# Fails (exit 1) when the text on stdin carries an AI attribution line: a Co-Authored-By or Claude-Session trailer,
# "Generated with Claude", or a claude.ai session link. Kate's rule: commits and PR descriptions carry none.
# Used by .husky/commit-msg (each commit) and the attribution workflow (every commit in a PR, and its description).
# A line that only mentions one (e.g. "the hook rejects a Claude-Session line") passes: trailers start the line.
pattern='^[[:space:]]*(co-authored-by:|claude-session:)|generated with \[?claude|claude\.ai/code/session_'
found=$(grep -iE "$pattern")
[ -z "$found" ] && exit 0
echo "AI attribution lines are not allowed in this repo:" >&2
echo "$found" >&2
exit 1
