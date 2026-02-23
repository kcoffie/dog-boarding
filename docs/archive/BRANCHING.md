# Branch Strategy and Workflow

## Branch Structure

| Branch | Purpose | Deploys To | Protected |
|--------|---------|------------|-----------|
| `main` | Production code | Production | YES |
| `uat` | User acceptance testing | UAT/Staging | NO |
| `develop` | v2 development | None (local only) | NO |

## Rules

### `main` Branch (Production)
- **NEVER** merge `develop` directly to `main`
- **NEVER** push v2/experimental features to `main`
- Only merge from `uat` after UAT approval
- All changes must be tested in UAT first

### `uat` Branch (Staging)
- Used for UAT testing before production
- Can receive bug fixes and approved features
- Merge to `main` only after user approval

### `develop` Branch (v2)
- Contains v2 features (external sync, etc.)
- Isolated from production workflow
- Will merge to `main` only when v2 is ready for release

## Workflow

### Bug Fixes / UAT Work
```
1. Create feature branch from `uat`
2. Make changes
3. Test locally
4. Merge to `uat`
5. Deploy to UAT environment
6. Get user approval
7. Merge `uat` to `main`
8. Deploy to production
```

### v2 Development
```
1. Create feature branch from `develop`
2. Make changes
3. Test locally
4. Merge to `develop`
5. (v2 stays isolated until release)
```

### Emergency Production Fix
```
1. Create hotfix branch from `main`
2. Make minimal fix
3. Test thoroughly
4. Merge to `main` AND `uat`
5. Deploy to production
```

## Branch Protection (GitHub Settings)

### Recommended Settings for `main`
1. Go to Repository Settings > Branches > Add rule
2. Branch name pattern: `main`
3. Enable:
   - [ ] Require a pull request before merging
   - [ ] Require approvals (1)
   - [ ] Dismiss stale PR approvals
   - [ ] Require status checks to pass
   - [ ] Require branches to be up to date
   - [ ] Do not allow bypassing the above settings

### How to Set Up
1. Go to: https://github.com/kcoffie/dog-boarding/settings/branches
2. Click "Add branch protection rule"
3. Enter `main` as the branch name pattern
4. Configure the settings above
5. Click "Create" or "Save changes"

## Deployment Environments

| Environment | Branch | URL |
|-------------|--------|-----|
| Production | `main` | (main app URL) |
| UAT/Staging | `uat` | https://qboarding.vercel.app |
| Development | `develop` | Local only |

## Preventing Future Issues

1. **Never merge develop to main directly**
2. **Always go through UAT first**
3. **Set up branch protection on main**
4. **Review all PRs before merging to main**
