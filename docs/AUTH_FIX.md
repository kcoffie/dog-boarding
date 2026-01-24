# Auth Fix Reference Doc

**Status**: ✅ VERIFIED WORKING
**Issue**: #22
**Updated**: 2026-01-23 17:50 PST

---

## Summary

Two bugs were found and fixed:
1. **Wrong form field names** in auth POST (email/passwd/nonce)
2. **Cookie parsing bug** that truncated values containing `=` characters

Both fixes are now verified working - schedule page fetches correctly with 199 appointment links.

---

## Problem

Authentication succeeds but cookies don't work for subsequent requests. Schedule fetch returns login page.

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `vite.config.js` | 147-182 | Proxy auth logic (FIXED) |
| `vite.config.js` | 251-261 | Cookie parsing (FIXED) |
| `src/lib/scraper/schedule.js` | 116-118 | Session check (OK - no fix needed) |
| `src/lib/scraper/auth.js` | - | Client-side auth, stores cookies |

---

## Progress Log

### Chunk 1: Observe (COMPLETE)
- [x] Start dev server
- [x] Run minimal sync test
- [x] Capture `[API Proxy]` terminal output
- [x] Document form fields found
- [x] Document login response content

### Chunk 2: Fix Auth Field Names (COMPLETE)
- [x] Change `username` → `email` in vite.config.js
- [x] Change `password` → `passwd` in vite.config.js
- [x] Add `nonce` to CSRF patterns in vite.config.js
- [x] Test auth - **NOW RETURNS 302 REDIRECT (SUCCESS!)**

### Chunk 3: Fix Cookie Parsing (COMPLETE)
- [x] Identified cookie truncation bug - `split('=')` loses chars when value contains `=`
- [x] Fixed with `indexOf('=')` approach to preserve full value
- [x] Added debug logging for parsed cookies

### Chunk 4: Staged Verification (COMPLETE)
- [x] Stage 1: Auth returns 302 redirect ✅
- [x] Stage 2: Schedule fetch returns schedule page (not login) ✅
  - HTML length: 346,996 chars
  - Page title: "Jan 18-24, 2026 | A Girl and Your Dog"
  - Schedule links found: 199
- [x] Stage 3: Session check false positive - **NOT AN ISSUE**
  - Schedule page does NOT contain both "login" AND "password" words
  - No fix needed for schedule.js:116-118

### Chunk 5: Full Batch Sync (NEXT)
- [ ] Run full batch sync test
- [ ] Verify data syncs to database correctly
- [ ] Close issue #22

---

## Bugs Fixed

### Bug 1: Wrong Form Field Names

**File**: `vite.config.js` lines 176-182

**Problem**: External site uses non-standard field names:
| Expected | Actual |
|----------|--------|
| `username` | `email` |
| `password` | `passwd` |
| `_token` | `nonce` |

**Fix**:
```javascript
formData.append('email', username);    // was 'username'
formData.append('passwd', password);   // was 'password'
if (csrfToken) {
  formData.append('nonce', csrfToken); // was '_token'
}
```

### Bug 2: Cookie Parsing Truncation

**File**: `vite.config.js` lines 251-261

**Problem**: Cookie values contain `=` (base64 padding), but `split('=')` only captures first segment:
```javascript
// BROKEN: loses "=xyz" part
const [name, value] = nameValue.split('=');
// DgU00="abc=xyz" → name="DgU00", value='"abc' (missing =xyz")
```

**Fix**: Use `indexOf` to split only on first `=`:
```javascript
const eqIndex = nameValue.indexOf('=');
if (eqIndex > 0) {
  const name = nameValue.substring(0, eqIndex).trim();
  const value = nameValue.substring(eqIndex + 1).trim();
  // DgU00="abc=xyz" → name="DgU00", value='"abc=xyz"' (complete)
}
```

---

## Test Commands

### Quick Stage Test (node)
```bash
cd /Users/kcoffie/qap/dog-boarding
node test-stages.mjs
```

### Full Batch Sync (browser console)
```javascript
import('/src/lib/scraper/batchSync.js').then(m => m.runBatchSync({
  startDate: new Date('2026-01-22'),
  endDate: new Date('2026-01-22'),
  onProgress: p => console.log('Progress:', p.stage, p.error || '')
}))
```

---

## Verification Results (2026-01-23 17:50 PST)

```
=== STAGE 1: AUTH ===
Auth success: true
Cookies length: 2295

=== STAGE 2: FETCH SCHEDULE ===
Fetch success: true
Fetch status: 200
HTML length: 346996

=== ANALYSIS ===
Has login form: false
Page title: Jan 18-24, 2026 | A Girl and Your Dog
Schedule links found: 199
Would trigger false positive: false

✅ RESULT: Got SCHEDULE page - cookies working!
```

---

## Lessons Learned

1. **Always check actual form field names** - Don't assume `username`/`password`. This site uses `email`/`passwd`.

2. **CSRF token field names vary** - This site uses `nonce`, not `_token` or `csrf_token`.

3. **HTTP 200 on login = failure** - A 200 response that returns login page HTML means login failed. Success is 302 redirect.

4. **Cookie values can contain special chars** - The `=` in base64 values breaks naive parsing. Use `indexOf` not `split`.

5. **JSON escaping matters** - When passing cookies through JSON, embedded quotes need proper escaping. Use `JSON.stringify()`, not manual string construction.

6. **Staged testing is valuable** - Testing auth → fetch → parse in stages made debugging much easier than running the full sync.
