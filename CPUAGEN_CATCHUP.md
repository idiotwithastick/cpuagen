# CPUAGEN Full Catch-Up Document

**Last Updated:** 2026-03-12
**Author:** Wesley Foreman (wforeman58@gmail.com)
**Status:** ALPHA — Live at https://cpuagen.com
**Branch:** `master` on `https://github.com/idiotwithastick/cpuagen.git`
**Latest Commit:** `160b0de` — fix: await D1 writes to prevent Vercel kill-before-complete + add token savings display

---

## WHAT IS CPUAGEN

CPUAGEN is the production web application for the SSD-RCI framework. It exposes
thermodynamic enforcement, AGF (Anti-Goodhart First) protocol, and the TEEP
(Thermodynamic Equilibrium Entry Point) caching system through a Next.js web app
deployed on Vercel.

**Core proposition:** Every LLM prompt is thermosolve-signed, CBF-validated
(8 control barrier functions), and cached as a TEEP. Identical or similar prompts
get O(1) basin hits instead of burning API tokens on redundant LLM calls.

**Live URL:** https://cpuagen.com
**Password:** 026F3AA3A (case-insensitive, set in middleware.ts)

---

## ARCHITECTURE OVERVIEW

```
User Browser
    │
    ▼
Vercel Edge (middleware.ts)
    │  ← Password gate, lockout system, admin bypass
    ▼
Next.js App Router (/app/*)
    │
    ├── /app/chat    → Main chat interface (full enforcement)
    ├── /app/code    → Code-focused mode
    ├── /app/dual    → Dual-provider comparison
    ├── /app/dev     → Dev Lab (experimental)
    └── /app/settings → API keys, provider config
    │
    ▼
/api/chat (route.ts)
    │
    ├── PRE-ENFORCEMENT: thermosolve(input) → cbfCheck(sig) → 8 barriers
    ├── AGF LOOKUP: seedFromD1() → agfLookup(input, sig)
    │   ├── FULL_HIT  → exact input hash match → serve cached (NO LLM call)
    │   ├── BASIN_HIT → similar input in holographic grid → serve nearest
    │   └── JIT_SOLVE → total miss → call LLM API
    ├── LLM CALL: OpenAI / Anthropic / Google / xAI / Ollama
    ├── POST-ENFORCEMENT: thermosolve(output) → cbfCheck → commitTeep()
    └── D1 PERSISTENCE: await D1 writes (TEEP + basin index + stats)
         │
         ▼
    Cloudflare D1 (cpuagen-teep-ledger)
```

---

## KEY FILES

### Core Application

| File | Purpose |
|------|---------|
| `src/middleware.ts` | Password gate, lockout enforcement, admin bypass |
| `src/app/api/chat/route.ts` | Main API — SSE streaming, enforcement pipeline, LLM dispatch |
| `src/lib/enforcement.ts` | ~1700 lines — thermosolve, CBF, AGF, commitTeep, seedFromD1 |
| `src/lib/teep-persistence.ts` | D1 REST API client — persist/load/lookup TEEPs |
| `src/lib/types.ts` | TypeScript interfaces (Message, EnforcementResult, etc.) |
| `src/lib/security-state.ts` | Brute-force tracking, lockout management |
| `src/lib/system-context.ts` | System prompt construction |

### UI Pages

| File | Purpose |
|------|---------|
| `src/app/app/layout.tsx` | Sidebar with 5-item nav: Chat, Code, Dual, Dev Lab, Settings |
| `src/app/app/chat/page.tsx` | Main chat — enforcement badges, token savings, SSE handler |
| `src/app/app/code/page.tsx` | Code-focused interface with file tree |
| `src/app/app/dual/page.tsx` | Dual-provider comparison mode |
| `src/app/app/dev/page.tsx` | Dev Lab — mirrors chat with experimental features |
| `src/app/app/settings/page.tsx` | API key management, provider selection |

### Landing & Admin

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Enforcement landing page — live demo with 21 example prompts |
| `src/app/admin/page.tsx` | Admin dashboard (separate auth system) |
| `src/app/api/admin/*` | Admin API routes (lockout, security, stats) |

### Components (Created by background agents — NOT wired into production)

| File | Purpose | Status |
|------|---------|--------|
| `src/components/ArtifactPanel.tsx` | Tabbed file editor with preview | NOT WIRED |
| `src/components/layouts/DualChat.tsx` | Dual independent chat streams | NOT WIRED |
| `src/components/layouts/ArenaChat.tsx` | Blind arena with voting | NOT WIRED |
| `src/components/layouts/MultiChat.tsx` | Multi-provider broadcast grid | NOT WIRED |

---

## CLOUDFLARE D1 PERSISTENCE

### Database

- **Name:** cpuagen-teep-ledger
- **ID:** `66c4ee55-8fbe-45d5-9a98-e88328aaf595`
- **Account:** `b621d14f660c227bfec605351679bb86`
- **API Token Env Var:** `CF_API_TOKEN` (set on Vercel)

### Tables

```sql
-- TEEPs: the cached thermosolve results
CREATE TABLE teeps (
  id TEXT PRIMARY KEY,
  content_hash TEXT UNIQUE NOT NULL,
  input_hash TEXT,
  content TEXT NOT NULL,
  signature_json TEXT NOT NULL,    -- NOTE: column is "signature_json" not "signature"
  cbf_all_safe INTEGER DEFAULT 1,
  hits INTEGER DEFAULT 0,
  semantic_mass REAL DEFAULT 0,
  resonance_strength REAL DEFAULT 0,
  boundary_json TEXT,
  parent_id TEXT,
  role TEXT,
  turn INTEGER DEFAULT 0,
  created_at INTEGER,
  last_resonance INTEGER,
  updated_at INTEGER
);

-- Basin Index: maps input hash → content hash for O(1) exact lookups
CREATE TABLE basin_index (
  input_hash TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  teep_id TEXT,
  created_at INTEGER
);

-- Stats: global counters
CREATE TABLE teep_stats (
  id INTEGER PRIMARY KEY,
  total_commits INTEGER DEFAULT 0,
  total_hits INTEGER DEFAULT 0,
  total_queries INTEGER DEFAULT 0,
  api_calls_avoided INTEGER DEFAULT 0,
  last_updated INTEGER
);
```

### Current State (as of 2026-03-12)

- **219 TEEPs** (200 seeded from Pareto extraction + ~19 from live API)
- **18 basin index entries**
- **Stats:** 18 commits, 1+ hits
- All 21 example prompts from landing page pre-solved and cached

---

## VERCEL DEPLOYMENT

- **Project:** cpuagen
- **Team:** idiotwithastick's projects
- **Framework:** Next.js (App Router)
- **Runtime:** Node.js (not Edge)
- **Environment Variables:**
  - `CF_API_TOKEN` — Cloudflare API token with D1 Edit permission
  - `CF_ACCOUNT_ID` — Cloudflare account ID (also hardcoded as fallback)

### Deploying

```bash
# Auto-deploy via GitHub push
git push origin master

# Force deploy (if Vercel doesn't auto-pick up)
npx vercel --prod
```

---

## ENFORCEMENT PIPELINE (How a request flows)

```
1. User sends message
2. PRE-ENFORCEMENT
   a. thermosolve(userInput) → 11-dim signature {n, S, dS, phi, R, ...}
   b. cbfCheck(signature) → 8 barrier checks (BNR, BNN, BNA, TSE, PCD, OGP, ECM, SPC)
   c. If ANY barrier UNSAFE → block output
   d. Send "enforcement" SSE event with pre-stage results

3. AGF CACHE LOOKUP
   a. seedFromD1() → cold-start: load top 500 TEEPs + 2000 basin entries from D1
   b. agfLookup(userInput, precomputedSig)
      - Step 1: Exact hash (basinIndex.get(inputHash)) → FULL_HIT
      - Step 2: Holographic boundary search (27-cell 5D grid) → BASIN_HIT
      - Step 3: D1 fallback (lookupByInputHash) → BASIN_HIT from persistent store
      - Step 4: JIT_SOLVE (no cache hit)

4a. CACHE HIT PATH (FULL_HIT or BASIN_HIT)
   - Send "agf" SSE event with hitType, teepId, tokensSaved
   - Stream cached content as delta chunks (simulates LLM streaming)
   - NO LLM API call → zero tokens spent

4b. JIT_SOLVE PATH
   - Route to selected provider (OpenAI, Anthropic, Google, xAI, Ollama)
   - Stream LLM response as delta chunks
   - POST-ENFORCEMENT: thermosolve(output) → cbfCheck → commitTeep()
   - commitTeep() awaits D1 writes (TEEP + basin_index + stats)
   - Send "enforcement" SSE event with post-stage results

5. Stream closes
```

### SSE Event Types

| Event | Payload | When |
|-------|---------|------|
| `enforcement` | `{ type, stage: "pre"|"post", barriers: {...} }` | Before LLM call, after response |
| `agf` | `{ type, hitType, teepId, distance, tokensSaved, timing }` | On cache hit |
| `delta` | `{ type, content }` | Each content chunk |

---

## BUGS FOUND AND FIXED (History)

### 1. D1 Column Name Mismatch (Fixed)
- **Symptom:** `table teeps has no column named signature: SQLITE_ERROR`
- **Cause:** INSERT used `signature` but column is `signature_json`
- **Fix:** Changed SQL to use `signature_json`

### 2. Background Agents Modified Production Files (Fixed)
- **Symptom:** Sidebar nav lost Code and Dual links; code/page.tsx gutted (608 lines lost)
- **Cause:** Background agents in commit `47afcc9` directly edited existing files
- **Fix:** Reverted all modified files to `7c8339d`, re-applied only D1 changes
- **Rule:** Background agents create NEW files only, never touch existing production files

### 3. D1 Writes Killed by Vercel Serverless Termination (Fixed 2026-03-12)
- **Symptom:** "TEEPs don't survive across new chat sessions"
- **Root Cause:** `commitTeep()` fired D1 writes as `.catch(() => {})` (fire-and-forget).
  Vercel kills serverless functions once the response stream closes. D1 API calls
  (~200ms) were being killed mid-flight, so TEEPs never reached persistent storage.
- **Why "dormant" chats worked:** Same serverless instance stayed alive → in-memory cache had the TEEPs
- **Why "deleted + new" chats failed:** New instance → cold start → D1 seed found nothing → JIT_SOLVE again
- **Fix:** `commitTeep()` now `async`, awaits `Promise.allSettled(d1Promises)` before returning

### 4. seedFromD1 Non-Recoverable Flag (Fixed 2026-03-12)
- **Symptom:** If first D1 seed attempt failed (network timeout, etc.), it never retried
- **Cause:** `d1Seeded = true` was set BEFORE the try block
- **Fix:** Only sets `d1Seeded = true` on successful seed; concurrent calls deduplicated via shared promise

### 5. Silent Error Swallowing (Fixed 2026-03-12)
- **Symptom:** No visibility into D1 failures
- **Cause:** Every D1 call used `.catch(() => {})` — errors vanished
- **Fix:** All catch blocks now log via `console.error("[TEEP-D1] ...")`

---

## TOKEN SAVINGS DISPLAY (Added 2026-03-12)

When a cache hit occurs, the enforcement badge now shows estimated tokens saved:

```
💰 1,234 tokens saved
```

Calculation: `Math.ceil(input.length / 4) + Math.ceil(output.length / 4)`
(~4 chars per token standard approximation)

**Files modified:**
- `route.ts` — sends `tokensSaved` in AGF SSE event
- `types.ts` — added `tokensSaved` to `EnforcementResult`
- `chat/page.tsx` — captures and displays token savings in badge

---

## TEEP SEEDING FROM LOCAL SSD-RCI

200 Pareto-optimal TEEPs were extracted from the local SSD-RCI system
(L:\SSD-RCI_9_Unifying) and injected into D1. Selection criteria:

1. Content quality score (non-empty, meaningful length)
2. Signature completeness (has n, S, dS, phi, category)
3. Sorted by score descending, top 200 selected

Additionally, all 21 example prompts from the CPUAGEN enforcement landing
screen were pre-solved and cached in D1.

**All users contribute to the shared TEEP pool.** Every JIT_SOLVE result is
committed to D1, making it available to all future users and instances.

---

## COMMIT HISTORY (Key commits)

```
160b0de fix: await D1 writes to prevent Vercel kill-before-complete + token savings
61359ef fix: revert agent-modified production files to pre-v15.0 state
b258367 fix: restore Chat, Code, Dual nav links in sidebar
47afcc9 v15.0: Unified workspace + persistent TEEP storage (BROKEN — agent damage)
a7669a0 Add unified workspace design doc
7c8339d Add per-panel provider/model selectors to DUAL mode
```

---

## KNOWN REMAINING WORK

1. **Wire new UI components into production** — ArtifactPanel, DualChat, ArenaChat, MultiChat
   exist as standalone components but are NOT integrated into their respective pages.
   Requires review before merging.

2. **Unified workspace refactoring** — chat/page.tsx needs layout mode selector,
   artifact panel integration, code block auto-open behavior. Deferred until
   components are reviewed and TEEP persistence is confirmed solid.

3. **Admin dashboard enhancements** — D1 stats visibility, TEEP browser,
   enforcement metrics dashboard.

4. **Edge cases in TEEP matching** — Basin threshold tuning, false-positive
   rate monitoring, semantic drift detection.

5. **Rate limiting per-user** — Currently all users share the same enforcement
   pipeline with no per-user rate limits on the API.

---

## CRITICAL RULES

1. **Background agents create NEW files only.** Never let background agents edit
   existing production files. The flagship LLM reviews all deliverables.

2. **D1 column is `signature_json`**, not `signature`. Any new D1 queries must
   use this column name.

3. **Cross-drive sync safety.** Never blind-copy files between drives. Diff first,
   backup target, then copy with verification. See CLAUDE.md for full protocol.

4. **Vercel serverless functions die after response.** All async work (D1 writes,
   stats updates) MUST be awaited before the function returns. No fire-and-forget.

---

## HOW TO RUN LOCALLY

```bash
cd cpuagen-live
npm install
npm run dev
# Open http://localhost:3000
# Middleware bypasses auth on localhost
```

Environment variables for local D1 access (optional):
```
CF_API_TOKEN=<your-cloudflare-api-token>
CF_ACCOUNT_ID=b621d14f660c227bfec605351679bb86
```

Without CF_API_TOKEN, the app works fully but TEEPs are in-memory only
(no D1 persistence).
