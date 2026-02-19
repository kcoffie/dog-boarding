# Dog Boarding App - Multi-User Web App Specification

## Overview

Convert the existing single-user localStorage-based dog boarding app into a secure multi-user web application with authentication and cloud database.

## Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | React (existing) | Keep current codebase |
| Backend/Database | Supabase | Auth + PostgreSQL + Row-Level Security in one |
| Auth | Supabase Auth | Secure, battle-tested, handles tokens/sessions |
| Hosting | Vercel or Netlify | Free tier, easy deploy, HTTPS included |
| Future Mobile | PWA | Add to home screen, works offline |

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────┐
│   React App     │  ←───→  │    Supabase     │
│  (Frontend)     │  HTTPS  │  - Auth         │
│                 │         │  - PostgreSQL   │
│  - Pages        │         │  - Row Security │
│  - Components   │         │  - Realtime     │
└─────────────────┘         └─────────────────┘
```

**Key Security Principle:** All data access goes through Supabase with Row-Level Security (RLS). Users can ONLY access their own data. No backend API to build—Supabase handles it.

---

## Database Schema

### Tables

```sql
-- Users are managed by Supabase Auth (auth.users)
-- We create a profiles table for additional user data

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  business_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  net_percentage DECIMAL(5,2) DEFAULT 65.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TABLE employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE dogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  day_rate DECIMAL(10,2) NOT NULL,
  night_rate DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE boardings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  dog_id UUID REFERENCES dogs(id) ON DELETE CASCADE NOT NULL,
  arrival_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  departure_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT valid_dates CHECK (departure_datetime > arrival_datetime)
);

CREATE TABLE night_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);
```

### Row-Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE dogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE boardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE night_assignments ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own profile
CREATE POLICY "Users can view own profile" 
  ON profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Settings: users can only access their own settings
CREATE POLICY "Users can view own settings" 
  ON settings FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
  ON settings FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
  ON settings FOR UPDATE 
  USING (auth.uid() = user_id);

-- Apply same pattern to all other tables
-- (employees, dogs, boardings, night_assignments)

CREATE POLICY "Users can manage own employees" 
  ON employees FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own dogs" 
  ON dogs FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own boardings" 
  ON boardings FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own night_assignments" 
  ON night_assignments FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Database Triggers

```sql
-- Auto-create profile and settings when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO settings (user_id, net_percentage)
  VALUES (NEW.id, 65.00);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Repeat for other tables with updated_at
```

---

## Authentication Flow

### Pages to Add

| Route | Page | Auth Required |
|-------|------|---------------|
| `/login` | Login form | No |
| `/signup` | Registration form | No |
| `/forgot-password` | Password reset request | No |
| `/reset-password` | Set new password | No (uses token) |
| `/` | Boarding Matrix | Yes |
| `/dogs` | Dogs management | Yes |
| `/settings` | Settings | Yes |

### Auth Features

1. **Email/Password login** - standard secure auth
2. **Email verification** - optional but recommended
3. **Password reset** - via email link
4. **Session management** - Supabase handles tokens securely
5. **Auto-logout** - on token expiry
6. **Protected routes** - redirect to login if not authenticated

### Auth Component Structure

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   ├── SignupForm.jsx
│   │   ├── ForgotPasswordForm.jsx
│   │   ├── ResetPasswordForm.jsx
│   │   └── ProtectedRoute.jsx
│   └── ...existing components
├── contexts/
│   └── AuthContext.jsx        # Provides user state to app
├── hooks/
│   └── useAuth.js             # Auth helper functions
├── lib/
│   └── supabase.js            # Supabase client setup
└── ...
```

### AuthContext Implementation

```jsx
// contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = (email, password) => 
    supabase.auth.signInWithPassword({ email, password });

  const signUp = (email, password) => 
    supabase.auth.signUp({ email, password });

  const signOut = () => supabase.auth.signOut();

  const resetPassword = (email) =>
    supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signIn, 
      signUp, 
      signOut, 
      resetPassword 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

### Protected Route Component

```jsx
// components/auth/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>; // Or a spinner
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
```

---

## Data Layer Migration

### Replace localStorage Hooks with Supabase

**Before (localStorage):**
```javascript
const [dogs, setDogs] = useLocalStorage('dogs', []);
```

**After (Supabase):**
```javascript
const { data: dogs, isLoading, error, mutate } = useDogs();
```

### Custom Hooks for Data

```javascript
// hooks/useDogs.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useDogs() {
  const { user } = useAuth();
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    
    fetchDogs();
    
    // Realtime subscription (optional)
    const subscription = supabase
      .channel('dogs_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'dogs' },
        () => fetchDogs()
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [user]);

  async function fetchDogs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('dogs')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setDogs(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addDog(dog) {
    const { data, error } = await supabase
      .from('dogs')
      .insert([{ ...dog, user_id: user.id }])
      .select()
      .single();
    
    if (error) throw error;
    setDogs(prev => [...prev, data]);
    return data;
  }

  async function updateDog(id, updates) {
    const { data, error } = await supabase
      .from('dogs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    setDogs(prev => prev.map(d => d.id === id ? data : d));
    return data;
  }

  async function deleteDog(id) {
    const { error } = await supabase
      .from('dogs')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    setDogs(prev => prev.filter(d => d.id !== id));
  }

  return { 
    dogs, 
    loading, 
    error, 
    addDog, 
    updateDog, 
    deleteDog, 
    refresh: fetchDogs 
  };
}
```

Create similar hooks for:
- `useSettings()`
- `useEmployees()`
- `useBoardings()`
- `useNightAssignments()`

---

## Security Checklist

### Supabase Configuration

- [ ] Enable Row-Level Security on ALL tables
- [ ] Test RLS policies (user A cannot see user B's data)
- [ ] Enable email confirmation (optional but recommended)
- [ ] Set password requirements (min length, etc.)
- [ ] Configure allowed redirect URLs for password reset
- [ ] Disable public access to database (default)

### Frontend Security

- [ ] Never expose Supabase service_role key (only use anon key in frontend)
- [ ] Store Supabase URL and anon key in environment variables
- [ ] Use HTTPS only (Vercel/Netlify handle this)
- [ ] Implement proper logout (clears session)
- [ ] Handle token refresh automatically (Supabase client does this)
- [ ] Validate all form inputs client-side AND rely on database constraints

### Environment Variables

```bash
# .env.local (never commit this)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

---

## Development Phases

### Phase 1: Supabase Setup
1. Create Supabase account and project
2. Run SQL to create tables (see schema above)
3. Run SQL to create RLS policies
4. Run SQL to create triggers
5. Get project URL and anon key
6. **Checkpoint: Test creating a user in Supabase dashboard**

### Phase 2: Frontend Supabase Integration
1. Install `@supabase/supabase-js`
2. Create `lib/supabase.js` client
3. Add environment variables
4. Create AuthContext
5. **Checkpoint: Console.log user after signup**

### Phase 3: Auth Pages
1. Create Login page
2. Create Signup page
3. Create Forgot Password page
4. Create Reset Password page
5. Create ProtectedRoute component
6. Update App.jsx with routes
7. **Checkpoint: Can sign up, log in, log out**

### Phase 4: Migrate Settings
1. Create `useSettings()` hook
2. Update Settings page to use Supabase
3. Test settings persist per user
4. **Checkpoint: Two users have different settings**

### Phase 5: Migrate Employees
1. Create `useEmployees()` hook
2. Update Settings page employee section
3. Test employee CRUD
4. **Checkpoint: Employees persist and are user-specific**

### Phase 6: Migrate Dogs
1. Create `useDogs()` hook
2. Update Dogs page to use Supabase
3. Test dog CRUD
4. **Checkpoint: Dogs persist and are user-specific**

### Phase 7: Migrate Boardings
1. Create `useBoardings()` hook
2. Update Dogs page boarding section
3. Update CSV import to use Supabase
4. Test boarding CRUD
5. **Checkpoint: Boardings persist, CSV import works**

### Phase 8: Migrate Night Assignments
1. Create `useNightAssignments()` hook
2. Update BoardingMatrix to use Supabase
3. Test assignment updates
4. **Checkpoint: Night assignments persist**

### Phase 9: Testing & Security Audit
1. Test with two different accounts (data isolation)
2. Verify RLS is working (try accessing other user's data via console)
3. Test all CRUD operations
4. Test auth flows (login, logout, password reset)
5. Test error handling (network failures, invalid data)
6. **Checkpoint: Security review complete**

### Phase 10: Deploy
1. Push code to GitHub
2. Connect to Vercel/Netlify
3. Add environment variables in hosting dashboard
4. Configure Supabase redirect URLs for production domain
5. Test production deployment
6. **Checkpoint: App works on production URL**

### Phase 11: PWA Setup (Optional - for iPhone)
1. Add manifest.json
2. Add service worker
3. Add app icons
4. Test "Add to Home Screen" on iPhone
5. **Checkpoint: App installable on iPhone**

---

## Testing Requirements

### Auth Tests

- [ ] Can sign up with valid email/password
- [ ] Cannot sign up with weak password
- [ ] Cannot sign up with invalid email
- [ ] Can log in with correct credentials
- [ ] Cannot log in with wrong password
- [ ] Logged out users redirected to login
- [ ] Logged in users redirected from login to app
- [ ] Password reset email sends
- [ ] Password reset link works
- [ ] Session persists on page refresh
- [ ] Logout clears session

### Data Isolation Tests

- [ ] User A cannot see User B's dogs
- [ ] User A cannot see User B's boardings
- [ ] User A cannot see User B's employees
- [ ] User A cannot see User B's settings
- [ ] User A cannot see User B's night assignments
- [ ] Verify in browser console: direct Supabase queries respect RLS

### Functional Tests

(Same as original spec, but verify data persists to cloud)

- [ ] All CRUD operations work
- [ ] Matrix calculations correct
- [ ] CSV import works
- [ ] Employee totals correct

---

## Deployment Checklist

### Before Going Live

- [ ] Test with real email addresses (not just test accounts)
- [ ] Verify password reset flow end-to-end
- [ ] Check all environment variables set in hosting platform
- [ ] Test on mobile browser
- [ ] Review Supabase usage/limits
- [ ] Set up error monitoring (optional: Sentry)

### Supabase Production Settings

- [ ] Enable email confirmation (recommended)
- [ ] Set strong password policy
- [ ] Review auth rate limits
- [ ] Set up database backups (Supabase Pro or manual)

---

## How to Use This Spec with Claude Code

**Initial Setup:**

> "I have an existing React dog boarding app using localStorage. I want to convert it to a multi-user app with secure authentication using Supabase. Here's my spec: [paste or reference this file]. 
>
> Let's start with Phase 1. Walk me through creating the Supabase project and give me the SQL to run for the tables, RLS policies, and triggers."

**After Supabase is set up:**

> "Supabase is ready. Now let's do Phase 2: integrate the Supabase client and create the AuthContext. Show me the code changes needed."

**Continue phase by phase, testing at each checkpoint.**

---

## Estimated Timeline

| Phase | Effort | Notes |
|-------|--------|-------|
| Supabase setup | 30 min | One-time setup in dashboard |
| Auth integration | 1-2 hours | New code |
| Auth pages | 1-2 hours | 4 new pages |
| Migrate data hooks | 2-3 hours | 5 hooks to convert |
| Testing | 1-2 hours | Manual + automated |
| Deploy | 30 min | Vercel/Netlify |
| PWA | 1 hour | Optional |

**Total: 7-12 hours** depending on pace and issues encountered.

---

## Future Enhancements (Out of Scope for Now)

- Google/Apple social login
- Email notifications for upcoming boardings
- Client portal (dog owners can see their bookings)
- Multiple staff roles/permissions
- Reporting and analytics
- Offline support with sync
- Native mobile app (React Native)
