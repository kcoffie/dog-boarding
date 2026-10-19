#!/bin/sh
# Fails (exit 1) when the text on stdin carries a realistic phone number or a personal email address.
# The repo is public: tests use fictional contact details only (docs/ENGINEERING_PROCESS.md, good tests rule 7; #264).
# CI runs it over every test file: git grep -n '' -- src/__tests__ | sh scripts/no-test-pii.sh
# - Phone: a North American number written as +1 then 10 digits, or as 3-3-4 digit groups with ( ) . - or
#   space between them, whose area code or exchange isn't 555 (the fictional range, so +1 555-555-0142 passes).
#   A bare 10-digit run with no +1 and no separators is a timestamp or an ID, not a phone.
# - Email: any address outside the allowed domains: the reserved example domains, the test placeholders,
#   and the service senders the gmail-monitor tests match on.
email='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
allowed='@(example\.(com|org|net)|test\.com|domain\.com|github\.com|vercel\.com|supabase\.com|anthropic\.com|someothertool\.io)([^A-Za-z0-9.-]|$)'

input=$(cat)
phones=$(printf '%s\n' "$input" | awk '
  {
    line = $0; rest = $0; real = 0
    while (match(rest, /\+1[ .-]?\(?[2-9][0-9][0-9]\)?[ .-]?[0-9][0-9][0-9][ .-]?[0-9][0-9][0-9][0-9]|\(?[2-9][0-9][0-9]\)?[ .-][0-9][0-9][0-9][ .-][0-9][0-9][0-9][0-9]|\([2-9][0-9][0-9]\)[0-9][0-9][0-9][ .-]?[0-9][0-9][0-9][0-9]/)) {
      before = substr(rest, RSTART - 1, 1); after = substr(rest, RSTART + RLENGTH, 1)
      num = substr(rest, RSTART, RLENGTH); rest = substr(rest, RSTART + RLENGTH)
      if (before ~ /[0-9]/ || after ~ /[0-9]/) continue
      gsub(/[^0-9]/, "", num); if (length(num) == 11) num = substr(num, 2)
      if (substr(num, 1, 3) != "555" && substr(num, 4, 3) != "555") real = 1
    }
    if (real) print line
  }')
emails=$(printf '%s\n' "$input" | grep -oE "$email" | grep -vE "$allowed")
[ -z "$phones" ] && [ -z "$emails" ] && exit 0
echo "Tests must use fictional contact details (555 phone numbers, @example.com emails):" >&2
[ -n "$phones" ] && printf '%s\n' "$phones" >&2
[ -n "$emails" ] && printf '%s\n' "$emails" >&2
exit 1
