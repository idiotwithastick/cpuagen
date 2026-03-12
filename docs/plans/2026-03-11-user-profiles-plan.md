# User Profiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OAuth-based user profiles with waitlist gating to CPUAGEN.

**Architecture:** Auth.js v5 with Drizzle adapter persists sessions and user data to Vercel Postgres. Middleware enforces role-based access (waitlist/member/admin). Password gate remains as Phase 1 outer layer.

**Tech Stack:** Next.js 16, Auth.js v5 (next-auth), Drizzle ORM, Vercel Postgres, Google/GitHub OAuth

**Design Doc:** `docs/plans/2026-03-11-user-profiles-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install auth and database packages**

Run:
```bash
cd L:/SSD-RCI_9_Unifying/cpuagen-live
npm install next-auth@5 @auth/drizzle-adapter drizzle-orm @vercel/postgres pg
npm install -D drizzle-kit @types/pg
```

**Step 2: Verify installation**

Run: `npm ls next-auth drizzle-orm @vercel/postgres`
Expected: All three listed with versions

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add auth and database dependencies"
```

---

### Task 2: Database Schema (Drizzle)

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`
- Create: `drizzle.config.ts`

**Step 1: Create Drizzle schema**

Create `src/lib/db/schema.ts`:
```typescript
import { pgTable, text, timestamp, uuid, integer, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),
  role: text("role").notNull().default("waitlist"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
]);

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  sessionState: text("session_state"),
}, (table) => [
  uniqueIndex("accounts_provider_idx").on(table.provider, table.providerAccountId),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.identifier, table.token] }),
]);
```

**Step 2: Create DB connection**

Create `src/lib/db/index.ts`:
```typescript
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import * as schema from "./schema";

export const db = drizzle(sql, { schema });
export type Database = typeof db;
```

**Step 3: Create Drizzle config**

Create `drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
});
```

**Step 4: Generate initial migration**

Run:
```bash
npx drizzle-kit generate
```
Expected: Creates `drizzle/0000_*.sql` with CREATE TABLE statements

**Step 5: Commit**

```bash
git add src/lib/db/ drizzle.config.ts drizzle/
git commit -m "feat: add Drizzle schema for users, accounts, sessions"
```

---

### Task 3: Auth.js Configuration

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

**Step 1: Create Auth.js config**

Create `src/lib/auth.ts`:
```typescript
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      // Fetch role from DB and attach to session
      const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id));
      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          role: dbUser?.role ?? "waitlist",
        },
      };
    },
  },
  pages: {
    signIn: "/app",
    error: "/app",
  },
});
```

**Step 2: Create API route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
```

**Step 3: Add auth type augmentation**

Create `src/types/next-auth.d.ts`:
```typescript
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
```

**Step 4: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/ src/types/
git commit -m "feat: configure Auth.js with Google/GitHub OAuth + Drizzle adapter"
```

---

### Task 4: Middleware — Role-Based Routing

**Files:**
- Modify: `src/middleware.ts:235-237` (matcher config)
- Modify: `src/middleware.ts:27-31` (add session check after password gate)

**Step 1: Update middleware to check auth session for /app routes**

After the existing password gate logic (which returns `NextResponse.next()` for authenticated password users), add role-based routing for `/app` routes. The key change: after the password cookie check passes, also check for an Auth.js session and enforce roles.

Add after the `cpuagen-auth` cookie check (around line 31), before the password submission logic:

```typescript
// Role-based access for /app routes (after password gate passes)
if (pathname.startsWith("/app")) {
  // Import auth dynamically to avoid issues when DB isn't configured
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();

    if (session?.user) {
      const role = session.user.role;

      // Waitlist users can only see /app/waitlist
      if (role === "waitlist" && !pathname.startsWith("/app/waitlist")) {
        return NextResponse.redirect(new URL("/app/waitlist", request.url));
      }

      // Admin routes require admin role
      if (pathname.startsWith("/app/admin") && role !== "admin") {
        return NextResponse.redirect(new URL("/app", request.url));
      }
    }
    // No session = not signed in with OAuth yet, allow through (password gate already passed)
  } catch {
    // Auth not configured yet, allow through
  }
}
```

Also update the matcher to allow `/api/auth` routes through:

```typescript
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|robots\\.txt).*)"],
};
```

Note: The existing matcher already excludes `/api/` routes, so Auth.js API routes at `/api/auth/[...nextauth]` are already bypassed. No matcher change needed.

**Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add role-based routing in middleware for waitlist/member/admin"
```

---

### Task 5: Sidebar — Sign In/Out + User Avatar

**Files:**
- Modify: `src/app/app/layout.tsx`

**Step 1: Convert layout to fetch session server-side**

The current layout is `"use client"`. We need to split it: keep the client sidebar but add a server wrapper that fetches the session. Create a `UserMenu` client component inline.

Add sign-in/sign-out buttons and user avatar to the sidebar footer (before the "Back to home" link). The approach: create a small client component `UserSection` that calls `/api/auth/session` client-side.

Add to the bottom of the sidebar (inside the `<div className="p-3 border-t ...">` section, before the "Back to home" link):

```tsx
{/* User section */}
<UserSection />
```

Create the `UserSection` component at the top of the file (or in a separate file):

```tsx
function UserSection() {
  const [session, setSession] = useState<{ user?: { name?: string; image?: string; role?: string; email?: string } } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(setSession).catch(() => {});
  }, []);

  if (!session?.user) {
    return (
      <div className="px-3 py-2 mb-2">
        <a href="/api/auth/signin" className="flex items-center gap-2 text-xs text-accent-light hover:text-foreground transition-colors">
          Sign in with Google/GitHub
        </a>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 mb-2 rounded-lg bg-surface-light/50">
      <div className="flex items-center gap-2">
        {session.user.image ? (
          <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] text-accent-light font-bold">
            {(session.user.name?.[0] || session.user.email?.[0] || "?").toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground truncate">{session.user.name || session.user.email}</div>
          <div className="text-[9px] font-mono text-muted uppercase">{session.user.role || "user"}</div>
        </div>
      </div>
      <a href="/api/auth/signout" className="block mt-1.5 text-[10px] text-muted hover:text-foreground transition-colors">
        Sign out
      </a>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/app/layout.tsx
git commit -m "feat: add user avatar and sign-in/out to app sidebar"
```

---

### Task 6: Waitlist Page

**Files:**
- Create: `src/app/app/waitlist/page.tsx`

**Step 1: Create waitlist page**

Create `src/app/app/waitlist/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";

export default function WaitlistPage() {
  const [user, setUser] = useState<{ name?: string; email?: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/session").then(r => r.json()).then(s => setUser(s?.user || null)).catch(() => {});
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">&#x23F3;</span>
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">You're on the waitlist</h1>
        <p className="text-sm text-muted mb-6">
          {user?.name ? `Welcome, ${user.name}! ` : ""}
          Your account has been created. You'll get full access once an admin approves your request.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-xs font-mono text-muted">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          WAITLIST POSITION CONFIRMED
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/app/waitlist/
git commit -m "feat: add waitlist landing page for pending users"
```

---

### Task 7: Admin User Management API

**Files:**
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[id]/route.ts`

**Step 1: Create list users endpoint**

Create `src/app/api/admin/users/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ users: allUsers });
  } catch (err) {
    console.error("Failed to list users:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
```

**Step 2: Create update user role endpoint**

Create `src/app/api/admin/users/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const VALID_ROLES = ["waitlist", "member", "admin"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { role } = await req.json();

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id, role: users.role });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("Failed to update user:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/admin/users/
git commit -m "feat: add admin API for listing users and updating roles"
```

---

### Task 8: Admin Dashboard — Users Tab

**Files:**
- Modify: existing admin dashboard page (likely `src/app/admin/page.tsx`)

**Step 1: Add a Users section to the admin dashboard**

Fetch `/api/admin/users` and render a table with approve/revoke buttons. Each button calls `PATCH /api/admin/users/[id]` with the new role.

This task depends on the existing admin page structure. Read the current admin page, then add a "Users" tab/section with:
- Table columns: Avatar, Name, Email, Role, Signed Up, Actions
- "Approve" button (waitlist -> member)
- "Revoke" button (member -> waitlist)

**Step 2: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add user management table to admin dashboard"
```

---

### Task 9: Environment Setup + Database Migration

**Step 1: Provision Vercel Postgres**

Run via Vercel dashboard or CLI:
```bash
vercel storage create postgres cpuagen-db
vercel env pull .env.local
```

**Step 2: Set up OAuth credentials**

- Google: Create OAuth client at console.cloud.google.com
  - Authorized redirect: `https://cpuagen.vercel.app/api/auth/callback/google`
- GitHub: Create OAuth app at github.com/settings/developers
  - Callback URL: `https://cpuagen.vercel.app/api/auth/callback/github`

**Step 3: Generate AUTH_SECRET**

```bash
npx auth secret
```

**Step 4: Set env vars in Vercel**

```bash
vercel env add AUTH_SECRET
vercel env add AUTH_GOOGLE_ID
vercel env add AUTH_GOOGLE_SECRET
vercel env add AUTH_GITHUB_ID
vercel env add AUTH_GITHUB_SECRET
```

**Step 5: Run database migration**

```bash
npx drizzle-kit push
```
Expected: Tables created in Vercel Postgres

**Step 6: Deploy and verify**

```bash
git push origin master
```

---

### Task 10: End-to-End Verification

**Step 1: Visit cpuagen.vercel.app**

Expected: Password gate still works as before

**Step 2: Enter access code, reach app**

Expected: Sidebar shows "Sign in with Google/GitHub" link

**Step 3: Click sign in, complete OAuth**

Expected: Redirected back to app, avatar appears in sidebar, role shows "waitlist"

**Step 4: Visit /app/chat directly**

Expected: Redirected to /app/waitlist (waitlist role enforced)

**Step 5: Admin promotes user**

Go to /admin, find user in Users table, click "Approve"
Expected: User role changes to "member"

**Step 6: Refresh app as promoted user**

Expected: Full access to chat, dev lab, settings
