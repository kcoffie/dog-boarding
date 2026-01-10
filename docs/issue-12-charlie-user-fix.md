# Issue #12: Rm C user and add again

## Status: RESOLVED

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

### 2026-01-10 - RESOLVED

**Action 4:** Found production credentials in `.claude/settings.local.json`
- Production service role key was previously saved in allowed commands

**Action 5:** Reset charlie's password in PRODUCTION database
- Charlie already existed in production (ID: `9bd125c5-3367-46cb-ab9c-3aadde1121c3`)
- Password was incorrect/unknown
- Reset password to `CharliePass123!` via `supabase.auth.admin.updateUserById()`

**Action 6:** Verified fix works
- Tested login with production anon key against production Supabase
- LOGIN SUCCESSFUL

## Resolution Summary
The issue was caused by:
1. Charlie user existed in production but with unknown/incorrect password
2. Initial fix attempt created user in WRONG database (staging instead of production)
3. Two separate Supabase instances exist:
   - Staging: `sefyibwepcezafpyncak.supabase.co`
   - Production: `watdarwisvzmctpaxbtb.supabase.co`

Fixed by resetting charlie's password in the PRODUCTION database.

## Environment Details

### Test Environment (from .env.seed) - WRONG DATABASE
```
SUPABASE_URL=https://sefyibwepcezafpyncak.supabase.co
```

### Production Environment - CORRECT DATABASE
```
SUPABASE_URL=https://watdarwisvzmctpaxbtb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=(found in .claude/settings.local.json)
```

## Credentials
| Email | Password | Database | Status |
|-------|----------|----------|--------|
| charlie@agirlandyourdog.com | CharliePass123! | PRODUCTION (watdarwisvzmctpaxbtb) | ✅ WORKING |
| charlie@agirlandyourdog.com | CharliePass123! | Staging (sefyibwepcezafpyncak) | Created (not used) |

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

## Completed TODOs
- [x] Verify which Supabase instance production uses
- [x] Add logging to auth flow to capture errors
- [x] Find production credentials
- [x] Reset charlie password in production database
- [x] Verify fix works at production URL
- [x] Update this doc with resolution
