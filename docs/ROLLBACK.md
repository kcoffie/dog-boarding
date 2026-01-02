# Rollback Plan

Quick reference for reverting changes if something goes wrong in production.

## 1. Rollback Vercel Deployment (Fastest)

If a deployment breaks production, rollback to the previous version:

```bash
# List recent deployments
npx vercel list

# Promote a previous deployment to production
npx vercel promote <deployment-url> --prod

# Example:
npx vercel promote dog-boarding-abc123.vercel.app --prod
```

Or use the Vercel Dashboard:
1. Go to https://vercel.com/kates-projects-1a601745/dog-boarding/deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"

## 2. Rollback Code Changes

If you need to revert a specific commit:

```bash
# Revert the last commit
git revert HEAD --no-edit
git push

# Revert a specific commit
git revert <commit-hash> --no-edit
git push

# Then redeploy
npx vercel --prod
```

## 3. Rollback Database Changes

### If a migration broke something:

**Option A: Reverse the migration manually**
```sql
-- Example: If you added a column that broke things
ALTER TABLE payments DROP COLUMN bad_column;
```

**Option B: Restore from Supabase backup**
1. Go to Supabase Dashboard → Settings → Database
2. Find "Database Backups"
3. Download or restore a previous backup

### Production Database Info
- **URL**: https://watdarwisvzmctpaxbtb.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/watdarwisvzmctpaxbtb

## 4. Emergency Contacts

| Role | Contact |
|------|---------|
| Vercel Support | https://vercel.com/support |
| Supabase Support | https://supabase.com/support |

## 5. Pre-Rollback Checklist

Before rolling back, confirm:
- [ ] What specifically is broken?
- [ ] When did it start (which deployment)?
- [ ] Is it affecting all users or just some?
- [ ] Screenshot/record the error if possible

## 6. Post-Rollback Steps

After rolling back:
1. Notify affected users that issue is resolved
2. Create a GitHub issue documenting what happened
3. Write a fix and test thoroughly before redeploying
4. Run smoke tests: `npm run test:smoke`

---

## Quick Reference

| Scenario | Action |
|----------|--------|
| Bad deploy, need to revert fast | Vercel: Promote previous deployment |
| Code bug found | `git revert`, push, redeploy |
| Database broken | Restore Supabase backup or reverse migration |
| Not sure what's wrong | Roll back Vercel first (fastest), investigate |
