#!/bin/sh
# Fails (exit 1) when the text on stdin carries a realistic phone number or a personal email address, and prints
# each offending line. The repo is public: tests use fictional contact details only (docs/ENGINEERING_PROCESS.md,
# good tests rule 7; REQ-653; #264). CI runs `npm run check:test-pii`, which is `--tracked-tests` mode: every tracked
# test file (src/__tests__ and colocated *.test.*). That mode fails when git finds no test files, so it can't pass empty.
# - Phone: a North American number written as +1 then 10 digits, or as 3-3-4 digit groups with ( ) . - or
#   space between them, whose area code or exchange isn't 555 (the fictional range, so +1 555-555-0142 passes).
#   A bare 10-digit run with no +1 and no separators, or one inside a longer digit run, is a timestamp or an ID.
# - Email: any address outside the allowed domains (any case, any subdomain): the reserved example domains, the
#   test placeholders, and the service senders the gmail-monitor tests match on.
if [ "$1" = "--tracked-tests" ]; then
  count=$(git ls-files -- src/__tests__ '*.test.*' | wc -l) || exit 1
  if [ "$count" -eq 0 ]; then echo "no-test-pii: git found no test files to check" >&2; exit 1; fi
  git grep -n '' -- src/__tests__ '*.test.*' | sh "$0"
  exit $?
fi

awk '
  BEGIN {
    phone = "\\+1[ .-]?\\(?[2-9][0-9][0-9]\\)?[ .-]?[0-9][0-9][0-9][ .-]?[0-9][0-9][0-9][0-9]|\\(?[2-9][0-9][0-9]\\)?[ .-][0-9][0-9][0-9][ .-][0-9][0-9][0-9][0-9]|\\([2-9][0-9][0-9]\\)[0-9][0-9][0-9][ .-]?[0-9][0-9][0-9][0-9]"
    email = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z][A-Za-z]+"
    allowed = "@([a-z0-9-]+\\.)*(example\\.(com|org|net)|test\\.com|domain\\.com|github\\.com|vercel\\.com|supabase\\.com|anthropic\\.com|someothertool\\.io)$"
    found = 0
  }
  {
    bad = 0
    # prev is the character just before rest: tracked explicitly, since substr(s, 0, 1) differs between awks.
    rest = $0; prev = ""
    while (!bad && match(rest, phone)) {
      before = RSTART > 1 ? substr(rest, RSTART - 1, 1) : prev
      after = substr(rest, RSTART + RLENGTH, 1)
      num = substr(rest, RSTART, RLENGTH); prev = substr(num, RLENGTH, 1); rest = substr(rest, RSTART + RLENGTH)
      # A leading + starts a new number whatever comes before it; otherwise a digit on either side means a longer run.
      if ((substr(num, 1, 1) != "+" && before ~ /[0-9]/) || after ~ /[0-9]/) continue
      gsub(/[^0-9]/, "", num); if (length(num) == 11) num = substr(num, 2)
      if (substr(num, 1, 3) != "555" && substr(num, 4, 3) != "555") bad = 1
    }
    rest = $0
    while (!bad && match(rest, email)) {
      addr = tolower(substr(rest, RSTART, RLENGTH)); rest = substr(rest, RSTART + RLENGTH)
      if (addr !~ allowed) bad = 1
    }
    if (bad) {
      if (!found) print "Tests must use fictional contact details (555 phone numbers, @example.com emails):" > "/dev/stderr"
      print > "/dev/stderr"; found = 1
    }
  }
  END { exit found }
'
