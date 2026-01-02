# Test Data

This document describes the test data created by the seed scripts.

## Running the Seed Script

```bash
# Set environment variables and run
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npm run seed

# Or reset everything and re-seed
npm run reset-db
```

## Test Accounts

| Email | Password | Notes |
|-------|----------|-------|
| admin@test.com | TestPass123! | Primary test account |
| user1@test.com | TestPass123! | Secondary test account |
| user2@test.com | TestPass123! | Secondary test account |

## Test Invite Codes

These codes can be used to test the invite-only signup flow:

| Code | Expiration |
|------|------------|
| TESTCODE1 | 1 year from seed date |
| TESTCODE2 | 1 year from seed date |
| TESTCODE3 | 1 year from seed date |

## Seeded Data

The seed script creates:

- **8 dogs** (Luna, Cooper, Bella, Max, Daisy, Charlie, Buddy, Sadie)
- **4 employees** (Kate, Nick, Alex, Sam - Sam is inactive)
- **~100 boardings** spread across past 30 days and next 30 days
- **21 night assignments** for the past week and next 2 weeks
- **Default settings** with 65% net percentage

## Notes

- Running `npm run seed` multiple times is safe - it checks for existing records
- Use `npm run reset-db` to clear all data and start fresh
- The seed script requires the `SUPABASE_SERVICE_ROLE_KEY` (not the anon key)
- Never run seed scripts against production (`VITE_ENVIRONMENT=production` will block it)
