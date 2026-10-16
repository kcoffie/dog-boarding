"""Commit-message filter for scripts/prepare-history-rewrite.sh: drops AI attribution lines (the same
pattern as scripts/no-attribution.sh) and trailing blank lines; every other line is kept as is."""
import re, sys
pat = re.compile(r'^[ \t]*(co-authored-by:.*(claude|anthropic)|claude-session:)|generated with \[?claude|claude\.ai/code/session_', re.I)
lines = [l for l in sys.stdin.read().split('\n') if not pat.search(l)]
while lines and lines[-1].strip() == '':
    lines.pop()
sys.stdout.write('\n'.join(lines) + '\n')
