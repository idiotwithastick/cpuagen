# CPUAGEN User Profiles Design

**Date:** 2026-03-11
**Status:** Approved
**Approach:** Auth.js v5 + Vercel Postgres + Drizzle ORM

## Goal

Add public user accounts with waitlist registration to CPUAGEN. Users sign in via OAuth (Google/GitHub), land on a waitlist, and get promoted to full access by an admin.

## Architecture

```
Browser → Next.js Middleware → Auth.js (next-auth v5)
                                    ↓
                              OAuth Providers
                              (Google, GitHub)
                                    ↓
                              Vercel Postgres
                              (via Drizzle ORM)
```

### Migration Path

1. **Phase 1 (this work):** Password gate stays. Behind the gate, users can create profiles via OAuth. Role-based access within the app.
2. **Phase 2 (future):** OAuth becomes the front door. Waitlist replaces the password gate.

## Data Model

```sql
-- Auth.js adapter tables
users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  email         TEXT UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,
  image         TEXT,
  role          TEXT NOT NULL DEFAULT 'waitlist',  -- waitlist | member | admin
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ
)

accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          INTEGER,
  token_type          TEXT,
  scope               TEXT,
  id_token            TEXT,
  session_state       TEXT,
  UNIQUE(provider, provider_account_id)
)

sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMPTZ NOT NULL
)

verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(identifier, token)
)
```

### Roles

| Role | Access | How assigned |
|------|--------|--------------|
| `waitlist` | Can see waitlist page only | Default on first OAuth sign-in |
| `member` | Full app access (chat, dev lab, settings) | Admin promotes from waitlist |
| `admin` | Full access + /admin routes | Manual DB update or seed |

## Auth Flow

1. User visits cpuagen.vercel.app
2. Password gate (middleware) — enters access code, passes through
3. Lands on app — sees "Sign in with Google/GitHub" in sidebar
4. OAuth flow — Auth.js handles provider redirect + callback
5. First-time user — row created in `users` with `role='waitlist'`
6. Returning user — session restored from DB
7. Middleware checks session + role:
   - No session → show sign-in prompt
   - `waitlist` → redirect to `/app/waitlist`
   - `member` → full `/app/*` access
   - `admin` → full access + `/admin/*` routes

## Files to Add/Modify

### New Files

```
src/lib/db/schema.ts           — Drizzle schema definitions
src/lib/db/index.ts            — DB connection pool
src/lib/auth.ts                — Auth.js config (providers, adapter, callbacks)
src/app/api/auth/[...nextauth]/route.ts  — Auth.js API route handler
src/app/app/waitlist/page.tsx  — Waitlist landing page
src/app/app/profile/page.tsx   — User profile page
drizzle.config.ts              — Drizzle Kit config for migrations
drizzle/                       — Migration SQL files
```

### Modified Files

```
src/middleware.ts              — Add session check + role-based routing
src/app/app/layout.tsx         — Add user avatar + sign-in/out in sidebar
package.json                   — Add dependencies
```

### New Dependencies

```
next-auth@5           — Auth.js v5 (App Router native)
@auth/drizzle-adapter — Drizzle adapter for Auth.js
drizzle-orm           — ORM
drizzle-kit           — Migration tooling
@vercel/postgres      — Vercel Postgres driver
pg                    — PostgreSQL client (for drizzle)
```

## Admin Waitlist Management

Add to existing `/admin` dashboard:

- Table: all users (email, name, role, provider, signup date)
- "Approve" button → PATCH `/api/admin/users/[id]` → role: waitlist → member
- "Revoke" button → role: member → waitlist
- Protected by existing admin auth system

## Environment Variables

```
# Vercel Postgres (auto-provisioned)
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=

# OAuth providers
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

# Auth.js
AUTH_SECRET=          # Generated via `npx auth secret`
AUTH_URL=https://cpuagen.vercel.app
```

## Error Handling

- OAuth failure → redirect to `/app?error=auth`
- DB connection failure → fallback to password-only mode (graceful degradation)
- Missing env vars → Auth.js disabled, app works without profiles

## Security

- All tokens stored server-side (httpOnly cookies via Auth.js)
- CSRF protection built into Auth.js
- OAuth tokens never exposed to client
- Admin routes protected by existing admin auth + role check
