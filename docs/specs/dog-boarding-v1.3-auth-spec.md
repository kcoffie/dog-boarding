# Dog Boarding App - v1.3 Authentication & User Management Spec

## Overview

Fix authentication for UAT launch. This is a **single-organization app** where all invited users share the same data. Only users you invite can sign up.

**Branch:** `main` (required for UAT to start)
**Release:** v1.3

---

## Requirements Summary

| Requirement | Description |
|-------------|-------------|
| Invite-only signup | Only users with a valid invite can create an account |
| Username/password auth | Standard email/password login |
| User self-management | Users can change password, update profile |
| Show logged-in user | Display username/email in app header |
| Shared data | All invited users see ALL boarding data (single org) |
| Tested | Full test coverage for auth flows |

---

## Current Problem

The previous setup likely has Row-Level Security (RLS) that isolates each user's data. For a single-org setup, we need:

1. All authenticated users can read/write all data
2. Only invited users can sign up
3. Anonymous users can't access anything

---

## Database Changes

### Option A: Remove user_id filtering (Simplest)

Change RLS policies to allow any authenticated user to access all data:

```sql
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can manage own dogs" ON dogs;
DROP POLICY IF EXISTS "Users can manage own boardings" ON boardings;
DROP POLICY IF EXISTS "Users can manage own employees" ON employees;
DROP POLICY IF EXISTS "Users can manage own settings" ON settings;
DROP POLICY IF EXISTS "Users can manage own night_assignments" ON night_assignments;

-- Create new policies: any authenticated user can access all data
CREATE POLICY "Authenticated users can read dogs"
  ON dogs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert dogs"
  ON dogs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update dogs"
  ON dogs FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete dogs"
  ON dogs FOR DELETE
  USING (auth.role() = 'authenticated');

-- Repeat for: boardings, employees, settings, night_assignments
-- Or use shorthand:

CREATE POLICY "Authenticated users full access"
  ON boardings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access"
  ON employees FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access"
  ON settings FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access"
  ON night_assignments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

### Option B: Organization-based (Future-proof)

If you might add multi-org later, create an org structure:

```sql
-- Create organizations table
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create org memberships
CREATE TABLE org_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Add org_id to all data tables
ALTER TABLE dogs ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE boardings ADD COLUMN org_id UUID REFERENCES organizations(id);
-- etc.

-- RLS: users can access data for orgs they belong to
CREATE POLICY "Org members can access dogs"
  ON dogs FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );
```

**Recommendation:** Start with Option A for v1.3 UAT. Add Option B in v2 if needed.

---

## Invite-Only Signup

### Approach: Invite Codes Table

```sql
-- Invite codes table
CREATE TABLE invite_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  email TEXT, -- Optional: lock invite to specific email
  created_by UUID REFERENCES auth.users(id),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS: Only authenticated users can create invites
-- Only unused invites can be viewed for validation
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can create invites"
  ON invite_codes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Anyone can check invite validity"
  ON invite_codes FOR SELECT
  USING (used_by IS NULL AND (expires_at IS NULL OR expires_at > NOW()));

CREATE POLICY "Auth users can update invites"
  ON invite_codes FOR UPDATE
  USING (auth.role() = 'authenticated');
```

### Signup Flow

1. User goes to `/signup`
2. User enters invite code
3. App validates code exists and is unused
4. User enters email and password
5. On successful signup, mark invite code as used
6. User is logged in and redirected to app

### Frontend Implementation

```jsx
// pages/SignupPage.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function SignupPage() {
  const [step, setStep] = useState('code'); // 'code' | 'register'
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Step 1: Validate invite code
  async function validateCode(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', inviteCode.trim())
      .is('used_by', null)
      .single();

    if (error || !data) {
      setError('Invalid or expired invite code');
      setLoading(false);
      return;
    }

    // If invite is locked to specific email, pre-fill it
    if (data.email) {
      setEmail(data.email);
    }

    setStep('register');
    setLoading(false);
  }

  // Step 2: Create account
  async function handleSignup(e) {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Create user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Mark invite as used
    await supabase
      .from('invite_codes')
      .update({ 
        used_by: authData.user.id, 
        used_at: new Date().toISOString() 
      })
      .eq('code', inviteCode.trim());

    // Redirect happens via auth state change
    setLoading(false);
  }

  if (step === 'code') {
    return (
      <form onSubmit={validateCode}>
        <h1>Sign Up</h1>
        <p>Enter your invite code to create an account</p>
        
        <input
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Enter invite code"
          required
        />
        
        {error && <p className="error">{error}</p>}
        
        <button type="submit" disabled={loading}>
          {loading ? 'Checking...' : 'Continue'}
        </button>
        
        <p>Already have an account? <a href="/login">Log in</a></p>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignup}>
      <h1>Create Account</h1>
      
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (min 8 characters)"
        minLength={8}
        required
      />
      
      {error && <p className="error">{error}</p>}
      
      <button type="submit" disabled={loading}>
        {loading ? 'Creating account...' : 'Create Account'}
      </button>
    </form>
  );
}
```

### Admin: Generate Invite Codes

Add to Settings page or create Admin page:

```jsx
// components/InviteManager.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function InviteManager() {
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInvites();
  }, []);

  async function fetchInvites() {
    const { data } = await supabase
      .from('invite_codes')
      .select('*')
      .order('created_at', { ascending: false });
    setInvites(data || []);
  }

  async function createInvite(e) {
    e.preventDefault();
    setLoading(true);

    // Generate random code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const { error } = await supabase.from('invite_codes').insert({
      code,
      email: email || null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });

    if (!error) {
      setEmail('');
      fetchInvites();
    }

    setLoading(false);
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code);
    // Show toast: "Copied!"
  }

  return (
    <div>
      <h2>Invite Users</h2>
      
      {/* Create invite form */}
      <form onSubmit={createInvite} className="flex gap-2 mb-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email (optional - leave blank for any)"
          className="flex-1"
        />
        <button type="submit" disabled={loading}>
          Generate Invite
        </button>
      </form>
      
      {/* List of invites */}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Email</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.id}>
              <td className="font-mono">{invite.code}</td>
              <td>{invite.email || 'Any'}</td>
              <td>
                {invite.used_by ? (
                  <span className="text-green-600">Used</span>
                ) : invite.expires_at && new Date(invite.expires_at) < new Date() ? (
                  <span className="text-red-600">Expired</span>
                ) : (
                  <span className="text-blue-600">Active</span>
                )}
              </td>
              <td>{new Date(invite.created_at).toLocaleDateString()}</td>
              <td>
                {!invite.used_by && (
                  <button onClick={() => copyCode(invite.code)}>
                    Copy
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## User Self-Management

### Profile Page (`/profile` or in Settings)

```jsx
// pages/ProfilePage.jsx
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  async function handleChangePassword(e) {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Password updated successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }

    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>
      
      {/* User Info */}
      <div className="bg-white rounded-lg p-4 mb-6 shadow-sm border">
        <div className="text-sm text-gray-500">Logged in as</div>
        <div className="text-lg font-medium">{user?.email}</div>
      </div>
      
      {/* Change Password */}
      <div className="bg-white rounded-lg p-4 shadow-sm border">
        <h2 className="text-lg font-semibold mb-4">Change Password</h2>
        
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              minLength={8}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              minLength={8}
              required
            />
          </div>
          
          {message.text && (
            <p className={message.type === 'error' ? 'text-red-600' : 'text-green-600'}>
              {message.text}
            </p>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-600 text-white rounded-lg"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Show Logged-In User in Header

```jsx
// components/Header.jsx
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';

export function Header() {
  const { user, signOut } = useAuth();

  return (
    <header className="bg-blue-600 text-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-lg font-semibold">
          Boarding
        </Link>
        
        <nav className="flex items-center gap-4">
          <Link to="/calendar">Calendar</Link>
          <Link to="/dogs">Dogs</Link>
          <Link to="/settings">Settings</Link>
          
          {/* User dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-medium">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline text-sm">
                {user?.email}
              </span>
            </button>
            
            {/* Dropdown menu */}
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="p-3 border-b">
                <div className="text-sm text-gray-500">Signed in as</div>
                <div className="text-gray-900 font-medium truncate">{user?.email}</div>
              </div>
              <Link 
                to="/profile" 
                className="block px-3 py-2 text-gray-700 hover:bg-gray-50"
              >
                My Profile
              </Link>
              <button
                onClick={signOut}
                className="block w-full text-left px-3 py-2 text-red-600 hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
```

### Mobile Header Variant

```jsx
// For mobile: simpler display
<div className="flex items-center gap-2">
  <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-sm font-medium">
    {user?.email?.charAt(0).toUpperCase()}
  </div>
  <Link to="/profile" className="text-sm underline">
    {user?.email?.split('@')[0]}
  </Link>
</div>
```

---

## Test Plan

### Auth Tests to Add

```javascript
// __tests__/auth/invite.test.js
describe('Invite Code System', () => {
  it('allows signup with valid invite code');
  it('rejects signup with invalid invite code');
  it('rejects signup with already-used invite code');
  it('rejects signup with expired invite code');
  it('marks invite as used after successful signup');
  it('restricts invite to specific email if set');
  it('allows admin to generate invite codes');
  it('shows invite status (active, used, expired)');
});

// __tests__/auth/login.test.js
describe('Login', () => {
  it('allows login with valid credentials');
  it('rejects login with invalid password');
  it('rejects login with non-existent email');
  it('shows appropriate error messages');
  it('redirects to app after successful login');
});

// __tests__/auth/userManagement.test.js
describe('User Self-Management', () => {
  it('displays current user email in header');
  it('displays current user email on profile page');
  it('allows password change with valid new password');
  it('rejects password change if passwords dont match');
  it('rejects password shorter than 8 characters');
  it('shows success message after password change');
  it('allows user to sign out');
});

// __tests__/auth/dataAccess.test.js
describe('Shared Data Access', () => {
  it('user A can see dogs created by user B');
  it('user A can see boardings created by user B');
  it('user A can edit data created by user B');
  it('unauthenticated user cannot access any data');
});
```

### E2E Tests

```typescript
// e2e/invite-signup.spec.ts
test.describe('Invite Signup Flow', () => {
  test('complete invite and signup flow', async ({ page }) => {
    // Admin generates invite
    await page.goto('/login');
    await page.fill('[name="email"]', 'admin@test.com');
    await page.fill('[name="password"]', 'AdminPass123!');
    await page.click('button[type="submit"]');
    
    await page.goto('/settings');
    await page.click('text=Generate Invite');
    
    // Get invite code (from table or clipboard)
    const inviteCode = await page.locator('.invite-code').first().textContent();
    
    // Log out
    await page.click('text=Sign Out');
    
    // New user signs up with code
    await page.goto('/signup');
    await page.fill('[name="inviteCode"]', inviteCode);
    await page.click('text=Continue');
    
    await page.fill('[name="email"]', 'newuser@test.com');
    await page.fill('[name="password"]', 'NewUser123!');
    await page.click('text=Create Account');
    
    // Verify logged in
    await expect(page.locator('text=newuser@test.com')).toBeVisible();
  });

  test('rejects invalid invite code', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('[name="inviteCode"]', 'INVALID');
    await page.click('text=Continue');
    
    await expect(page.locator('text=Invalid or expired')).toBeVisible();
  });
});

// e2e/shared-data.spec.ts
test.describe('Shared Data Access', () => {
  test('two users can see same data', async ({ browser }) => {
    // User A creates a dog
    const pageA = await browser.newPage();
    await loginAs(pageA, 'userA@test.com');
    await pageA.goto('/dogs');
    await pageA.click('text=Add Dog');
    await pageA.fill('[name="name"]', 'SharedDog');
    await pageA.fill('[name="nightRate"]', '50');
    await pageA.click('text=Save');
    
    // User B sees the dog
    const pageB = await browser.newPage();
    await loginAs(pageB, 'userB@test.com');
    await pageB.goto('/dogs');
    
    await expect(pageB.locator('text=SharedDog')).toBeVisible();
  });
});
```

---

## Implementation Phases

### Phase 1: Fix RLS Policies
1. Update RLS to allow all authenticated users to access all data
2. Test that data is visible after login
3. **Checkpoint:** Logged-in users can see all dogs/boardings

### Phase 2: Invite System
1. Create invite_codes table
2. Build invite validation on signup page
3. Build invite generation in settings
4. **Checkpoint:** Can only sign up with valid invite

### Phase 3: User Display
1. Add user email to header
2. Add user dropdown with sign out
3. Create profile page
4. **Checkpoint:** User visible in header, can access profile

### Phase 4: User Self-Management
1. Add password change form
2. Add validation and error handling
3. **Checkpoint:** Users can change their password

### Phase 5: Testing
1. Write unit tests for invite validation
2. Write integration tests for auth flows
3. Write E2E tests for complete flows
4. Verify 80%+ coverage on new code
5. **Checkpoint:** All tests passing

### Phase 6: Release
1. Update CHANGELOG for v1.3
2. Test complete flow manually
3. Tag and release v1.3
4. Deploy to production
5. **Checkpoint:** UAT can begin!

---

## Prompt for Claude Code

> "I need to fix authentication for UAT. Read the spec at `docs/v1.3-auth-spec.md` and implement it.
>
> Key requirements:
> 1. Change RLS so all authenticated users see all data (single org)
> 2. Add invite-only signup (invite_codes table)
> 3. Show logged-in user's email in the header
> 4. Add profile page with password change
> 5. Add invite management to settings page
> 6. Write tests for all new functionality
>
> Work on `main` branch. Start with Phase 1: Fix RLS policies so users can see data."

---

## Quick Reference: Supabase SQL to Run

```sql
-- Run this in Supabase SQL Editor

-- 1. Create invite_codes table
CREATE TABLE invite_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  email TEXT,
  created_by UUID REFERENCES auth.users(id),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can check unused invites"
  ON invite_codes FOR SELECT
  USING (used_by IS NULL);

CREATE POLICY "Auth users can create invites"
  ON invite_codes FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth users can mark invites used"
  ON invite_codes FOR UPDATE
  USING (true);

-- 2. Fix RLS on data tables (run for each table)
DROP POLICY IF EXISTS "Users can manage own dogs" ON dogs;
CREATE POLICY "Authenticated users full access" ON dogs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Repeat for: boardings, employees, settings, night_assignments
```
