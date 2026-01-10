# Issue #12: Rm C user and add again

## Status: IN PROGRESS - WAITING FOR PRODUCTION CREDENTIALS

## Problem Statement
User `charlie@agirlandyourdog.com` cannot log in - gets "invalid credentials" error.

## Investigation Log

### 2026-01-10 - Initial Investigation

**Finding 1:** Charlie user did not exist in Supabase auth database
- Queried users via `supabase.auth.admin.listUsers()`
- Only found: `admin@test.com`, `user1@test.com`, `user2@test.com`
- No charlie user present

**Action 1:** Created charlie user via Supabase Admin API
- Email: `charlie@agirlandyourdog.com`
- Password: `CharliePass123!`
- User ID: `9105ec8f-d982-4a1e-b936-218e97c60d43`
- Email confirmed: Yes

**Action 2:** Created test script `scripts/test-charlie-login.js`
- Tests login via Supabase client-side auth
- Test PASSED against database directly

**Issue:** Login still fails at https://qboarding.vercel.app/login
- Test script passed but production app returns "Invalid login credentials"

### 2026-01-10 - Root Cause Found

**ROOT CAUSE IDENTIFIED:** Production uses a DIFFERENT Supabase instance!

| Environment | Supabase URL |
|-------------|--------------|
| Test (.env.seed) | `https://sefyibwepcezafpyncak.supabase.co` |
| **Production** | `https://watdarwisvzmctpaxbtb.supabase.co` |

The charlie user was created in the TEST database, not PRODUCTION.

**How discovered:** Extracted Supabase URL from production JavaScript bundle:
```bash
curl -s "https://qboarding.vercel.app/assets/index-DzODiElQ.js" | grep -o 'https://[a-z0-9]*\.supabase\.co'
# Returns: https://watdarwisvzmctpaxbtb.supabase.co
```

**Action 3:** Added logging to auth flow
- Added auth logging to `src/context/AuthContext.jsx`
- Added Supabase URL logging to `src/lib/supabase.js`
- Errors always logged, other logs require `localStorage.setItem('debug', 'true')`

### Next Steps
- [ ] **BLOCKER:** Need production Supabase service role key for `watdarwisvzmctpaxbtb`
- [ ] Create charlie user in PRODUCTION Supabase
- [ ] Verify fix works at https://qboarding.vercel.app/login

## Environment Details

### Test Environment (from .env.seed) - WRONG DATABASE
```
SUPABASE_URL=https://sefyibwepcezafpyncak.supabase.co
```

### Production Environment - CORRECT DATABASE
```
SUPABASE_URL=https://watdarwisvzmctpaxbtb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=??? (NEEDED)
```

## Credentials Created
| Email | Password | Created | Verified |
|-------|----------|---------|----------|
| charlie@agirlandyourdog.com | CharliePass123! | 2026-01-10 | Test passed, prod FAILED |

## Files Modified
- `scripts/test-charlie-login.js` - NEW
- `package.json` - Added test:charlie-login script
- `docs/TEST-DATA.md` - Added charlie credentials
- `docs/REQUIREMENTS.md` - Added REQ-007
- `scripts/check-requirements.js` - Skip Planned requirements

## Related
- GitHub Issue #12: https://github.com/kcoffie/dog-boarding/issues/12
- GitHub Issue #17: https://github.com/kcoffie/dog-boarding/issues/17 (Admin user management)
- Branch: uat

## Remaining TODOs
- [ ] Verify which Supabase instance production uses
- [ ] Add logging to LoginPage.jsx to capture auth errors
- [ ] Check Vercel environment configuration
- [ ] Re-create charlie user in correct database if needed
- [ ] Verify fix works at production URL
- [ ] Update this doc with resolution
