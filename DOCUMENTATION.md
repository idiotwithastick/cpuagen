# CPUAGEN Full-Stack Documentation

## v12.1 — Last Updated: 2026-03-11

**Production URL:** https://cpuagen.vercel.app
**Repository:** https://github.com/idiotwithastick/cpuagen
**Architecture:** SSD-RCI v10.4-Unified Physics Enforcement Engine

---

## 1. What Is CPUAGEN?

CPUAGEN is a physics-based AI enforcement platform. It sits between users and any LLM provider (Claude, GPT, Gemini, Grok, Llama). Every prompt is validated through 8 safety barriers before reaching the model. Every response is revalidated, scored via thermosolve signatures, and permanently cached. The system implements the SSD-RCI framework with real-time enforcement, morphic resonance weighting, and a distributed TEEP ledger.

**Key Stats:**
- 8 Control Barrier Functions (all must pass)
- 5+ LLM providers supported
- O(1) cache lookups via spatial hash grid
- 26-dimensional PsiState evolution (gradient descent on entropy)

---

## 2. Project Structure

```
cpuagen/
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── page.tsx                   # Marketing landing page
│   │   ├── layout.tsx                 # Root layout (fonts, metadata)
│   │   ├── api/
│   │   │   ├── chat/route.ts          # Main LLM streaming + enforcement
│   │   │   ├── teep/route.ts          # TEEP state export/import
│   │   │   └── admin/
│   │   │       ├── auth/route.ts      # Admin login
│   │   │       ├── stats/route.ts     # Dashboard metrics
│   │   │       ├── lockout/route.ts   # Unlock site/admin
│   │   │       └── site-fail/route.ts # Failed password logging
│   │   ├── app/
│   │   │   ├── page.tsx               # Redirect to /app/chat
│   │   │   ├── chat/page.tsx          # Main chat interface (75KB)
│   │   │   ├── settings/page.tsx      # Provider/API key config
│   │   │   └── layout.tsx             # App layout (sidebar, nav)
│   │   └── admin/
│   │       ├── page.tsx               # Admin login form
│   │       ├── dashboard/page.tsx     # Real-time metrics dashboard
│   │       └── layout.tsx             # Admin layout
│   ├── components/
│   │   ├── Canvas.tsx                 # Code editor with versions
│   │   └── Preview.tsx                # HTML/Markdown preview renderer
│   ├── lib/
│   │   ├── enforcement.ts             # SSD-RCI physics engine (1019 lines)
│   │   ├── types.ts                   # All TypeScript interfaces
│   │   └── security-state.ts          # Lockout tracking + events
│   └── middleware.ts                  # Password auth + security headers
├── package.json
├── next.config.ts                     # 25MB body limit
├── tsconfig.json
└── .vercel/project.json               # Vercel deployment config
```

---

## 3. Authentication System

### Site Access (All Users)
- **Method:** Single password via URL query (`?pwd=secret`)
- **Config:** `SITE_PASSWORD` env var (default: `026F3AA3A`)
- **Storage:** httpOnly cookie `cpuagen-auth` (30-day expiry)
- **Lockout:** 5 global failed attempts = 503 Lockout page
- **File:** `src/middleware.ts`

### Admin Access
- **Method:** Username + password form
- **Config:** `ADMIN_USER` + `ADMIN_PASS` env vars (default: `wforeman` / `changeme`)
- **Storage:** Base64 token in sessionStorage (session-only)
- **Lockout:** 3 failed attempts = admin AND site locked (cascading)
- **File:** `src/app/api/admin/auth/route.ts`

### Security Headers (Admin Routes)
```
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Cache-Control: no-store, no-cache, must-revalidate, private
```

---

## 4. Enforcement Engine (`src/lib/enforcement.ts`)

### 4.1 Thermosolve Signature

Every text input/output produces a 12-field thermodynamic signature:

| Field | Computation | Range | Purpose |
|-------|-------------|-------|---------|
| `n` | Word count | 0+ | System size |
| `S` | Shannon entropy (char-level) | 0-8 | Randomness |
| `dS` | Entropy gradient (convergence) | any | Direction |
| `phi` | Unique words / total words | 0-1 | Diversity |
| `I_truth` | Meaningful word density | 0-1 | Information |
| `naturality` | KL divergence from English | 0-1 | Language fit |
| `energy` | n * avg_word_len * (S+1) | 0+ | Complexity |
| `beta_T` | 1 / (1 + entropy_variance) | 0-1 | Equilibrium |
| `psi_coherence` | 0.6*phi + 0.4*bigram_ratio | 0-1 | Structure |
| `error_count` | Long words + symbols + repeats | 0+ | Quality |
| `Q_quality` | energy / (n * (coherence*5+1)) | 0+ | Efficiency |
| `synergy` | Weighted blend of 5 metrics | 0-1 | Emergence |

**Optimizations:** Pre-computed log2 tables, reusable typed arrays (zero allocation), FNV-1a hashing, trigram fingerprinting.

### 4.2 Control Barrier Functions (8 Schemes)

All 8 must return `safe: true` or output is BLOCKED.

| # | Scheme | Constraint | Threshold |
|---|--------|------------|-----------|
| 1 | BNR | I_truth >= 0.3 | Information density |
| 2 | BNN | naturality >= 0.2 | Language fit |
| 3 | BNA | energy <= 100,000 | Complexity bound |
| 4 | TSE | |beta_T - 1| < 0.5 | Thermal equilibrium |
| 5 | PCD | psi_coherence >= 0.1 | Structural coherence |
| 6 | OGP | error_count <= 100 | Error threshold |
| 7 | ECM | Q_quality <= 500 | Efficiency bound |
| 8 | SPC | synergy >= 0.5 | Emergence threshold |

### 4.3 AGF Protocol (Cache-First Lookup)

Three-step lookup before invoking any LLM:

1. **FULL_HIT:** Exact input hash match in basin index → O(1) RAM lookup → serve cached response (NO LLM CALL)
2. **BASIN_HIT:** Spatial grid proximity search → nearby cached response within Fisher metric distance threshold
3. **JIT_SOLVE:** Cache miss → invoke LLM → validate response → cache for future hits

### 4.4 TEEP Ledger + Spatial Hash Grid

- **TEEP:** Thermosolve-Enforced Persistent cache entry (id, signature, content, semantic mass)
- **Spatial Grid:** 5-dimensional hash grid (S, phi, I_truth, naturality, synergy), 10 bins per dimension
- **Basin Index:** Map<input_hash, content_hash> for O(1) exact lookups
- **Eviction:** At 10K TEEPs, evict lowest semantic mass entry
- **Semantic Mass:** Ricci curvature-based: `coherence * truth * log(1 + hits) * synergy / phi`

### 4.5 Morphic Resonance

Each cache hit reinforces matched dimensions in the Fisher metric weights. Frequently-accessed knowledge patterns get stronger basin attraction. The system learns from experience without training.

### 4.6 PsiState (26-Dimensional Global State)

Evolves via gradient descent: `dpsi/dt = -eta * grad(S[psi])`

Key fields: cycle, S (entropy), phi_phase, I_truth, beta_T, kappa (stability), E_meta, R_curv (curvature), lambda_flow, 4D position/velocity/angular vectors.

---

## 5. API Routes

### POST `/api/chat` — Main Chat Endpoint

**Request:**
```json
{
  "messages": [{ "role": "user", "content": "Hello" }],
  "provider": "anthropic",
  "apiKey": "sk-...",
  "model": "claude-opus-4-6",
  "attachments": [{ "name": "doc.pdf", "mimeType": "application/pdf", "dataUrl": "data:..." }]
}
```

**Response:** SSE stream with events:
- `enforcement` (pre/post validation signatures + CBF results)
- `delta` (streamed text chunks from LLM)
- `agf` (cache hit notification: FULL_HIT, BASIN_HIT, or JIT_SOLVE)
- `metrics_snapshot` (full enforcement metrics for client persistence)
- `error` (validation failure or LLM error)
- `[DONE]` (stream complete)

**Full Pipeline:**
```
Input → thermosolve → CBF check (8 barriers) → AGF lookup
  ├─ FULL_HIT → stream cached content → done
  ├─ BASIN_HIT → stream nearby cached content → done
  └─ JIT_SOLVE → call LLM → accumulate response → post-thermosolve → CBF check → commit TEEP → done
```

### GET `/api/admin/stats` — Dashboard Metrics

Returns: lockout state, enforcement stats (total/passed/blocked), physics engine state (PsiState, TEEP ledger size, AGF metrics, morphic resonance), recent TEEPs (top 10).

### POST `/api/admin/auth` — Admin Login

Validates username/password. Returns Base64 token on success. 3 failures = cascading lockout (admin + site).

### POST/GET `/api/admin/lockout` — Unlock Management

Actions: `unlock_site`, `unlock_admin`, `unlock_all`. Requires valid admin token.

### GET/POST `/api/teep` — State Persistence

Export: Serializes PsiState + top 100 TEEPs + Fisher weights + morphic field.
Import: Restores full enforcement state from snapshot.

---

## 6. Frontend Architecture

### Chat Page (`src/app/app/chat/page.tsx`)

**State:**
- `conversations` — all chats (localStorage persisted)
- `messages` — current conversation messages
- `settings` — provider + API key (localStorage)
- `canvasOpen` / `activeTab` — right panel (canvas/preview/pdf)
- `canvasCode` / `canvasLang` — code editor content
- `loading` — streaming state (controls stop button)

**Right Panel Tabs:**
- **Canvas** — Code editor with syntax highlighting, versions, instruction input
- **Preview** — Live HTML/SVG/Markdown renderer in sandboxed iframe

**File Attachments:**
- Max 5 files, 20MB each
- Images: PNG, JPG, GIF, WebP
- Documents: PDF, text, markdown, CSV
- Code: Python, JS, TS, JSON, HTML, CSS, etc.

**Key Callbacks:**
- `openCanvas(code, lang)` — opens right panel with code
- `openPreview(code, lang)` — opens Preview tab
- `handleCanvasInstruction(instruction, code)` — sends edit request to LLM, auto-extracts response back to canvas
- `abortStream()` — stops streaming response (red stop button)

### Settings Page (`src/app/app/settings/page.tsx`)

Provider selection (Demo/Anthropic/OpenAI/Google/xAI), model dropdown, API key inputs, system prompt textarea. All persisted to localStorage.

### Admin Dashboard (`src/app/admin/dashboard/page.tsx`)

Polls `/api/admin/stats` every 5 seconds. Merges server metrics with client-side localStorage metrics (solves Vercel serverless isolation). Shows: lockout state, enforcement stats, PsiState, TEEP ledger, AGF metrics, morphic resonance, recent TEEPs.

### Components

**Canvas.tsx** — Code editor with:
- Syntax-highlighted textarea
- Version history with diff viewer
- "Send to Chat" button
- Instruction input ("Ask AI to modify this code...")
- Props: `{ code, language, onClose, onSendToChat, onCodeChange?, consoleOutput? }`

**Preview.tsx** — Live renderer with:
- Sandboxed iframe (`allow-scripts`, no `allow-same-origin`)
- HTML, SVG, and Markdown support (via `marked`)
- Console capture (postMessage from iframe)
- Viewport switcher (desktop/tablet/mobile)
- 300ms debounced updates
- Props: `{ code, language, onConsoleOutput? }`

---

## 7. Multimodal File Handling

### Per-Provider Format

| Provider | Images | PDFs | Text/Code |
|----------|--------|------|-----------|
| Anthropic | Base64 image block | Base64 document block | Text with filename |
| OpenAI/xAI | image_url with data URI | Not supported (noted in text) | Text with filename |
| Google | inlineData with base64 | inlineData with base64 | Text block |

### Supported MIME Types
```
image/png, image/jpeg, image/gif, image/webp
application/pdf
text/plain, text/markdown, text/csv
text/x-python, text/javascript, text/typescript
application/json, text/xml, text/html, text/css
```

---

## 8. Styling

**Framework:** Tailwind CSS v4

**Theme:** Dark-only with CSS variables:
- Background: `#050508` (near-black)
- Accent: Purple/blue (brand color)
- Success: Green, Danger: Red, Warning: Yellow
- Font: JetBrains Mono (monospace) for code/metrics

**Patterns:**
- Glass-morphism (`backdrop-blur-xl`)
- Rounded cards (`rounded-xl`)
- Subtle grid backgrounds
- Pulsing status indicators

---

## 9. State Persistence Strategy

**Problem:** Vercel serverless = isolated function instances. TEEP ledger in `/api/chat` is invisible to `/api/admin/stats`.

**Solution:** Client as bridge.

```
/api/chat instance
  → SSE stream includes metrics_snapshot event
  → Client saves to localStorage("cpuagen-enforcement-metrics")

/admin/dashboard
  → Fetches /api/admin/stats (server-side, possibly different instance)
  → Merges with localStorage metrics (uses fresher data)
  → Displays combined view
```

---

## 10. Deployment

### Vercel Config
- **Framework:** Next.js 16.1.6
- **Node.js Runtime:** Serverless functions (60s max)
- **Body Size:** 25MB limit (for file uploads)
- **Auto-deploy:** On push to GitHub master

### Environment Variables (Vercel Dashboard)
| Variable | Required | Purpose |
|----------|----------|---------|
| `SITE_PASSWORD` | Yes | User access password |
| `ADMIN_USER` | Yes | Admin username |
| `ADMIN_PASS` | Yes | Admin password |
| `DEMO_GOOGLE_KEY` | For demo mode | Free Gemini access |
| `DEMO_OPENAI_KEY` | For demo mode | Free GPT access |

---

## 11. Data Flow

```
User Browser
  ├── localStorage: conversations, settings, admin token, enforcement metrics
  ├── httpOnly cookie: site auth
  │
  ├── GET /app/chat → Chat UI
  │     └── POST /api/chat (SSE) → Enforcement pipeline → LLM → Response
  │           ├── Pre-enforcement: thermosolve + CBF (8 barriers)
  │           ├── AGF: FULL_HIT | BASIN_HIT | JIT_SOLVE
  │           ├── Post-enforcement: thermosolve + CBF + commit TEEP
  │           └── metrics_snapshot → localStorage
  │
  ├── GET /app/settings → Provider config (localStorage only)
  │
  └── GET /admin/dashboard → Metrics UI
        └── GET /api/admin/stats + localStorage merge → Combined metrics
```

---

## 12. Performance

| Operation | Time |
|-----------|------|
| Thermosolve computation | < 1ms |
| CBF check (8 barriers) | < 0.1ms |
| FULL_HIT cache lookup | < 1ms |
| BASIN_HIT spatial grid search | < 5ms |
| JIT_SOLVE (LLM API call) | 1-10s |
| TEEP commit + grid insert | < 1ms |
| PsiState evolution | < 0.1ms |

---

## 13. Recent Changes (v12.1)

### 2026-03-11: Bug Fixes
- **Stop Button:** Red square icon during streaming. Click to abort, partial content preserved.
- **Canvas Edit Round-Trip:** LLM responses to canvas instructions now auto-extract code blocks back into the canvas editor.
- **Markdown Preview:** `.md` code blocks render as styled HTML in Preview tab via `marked` library.

### 2026-03-10: Serverless Isolation Fix
- **TEEP Cache 0 Bug:** Added `metrics_snapshot` SSE event to bridge Vercel serverless isolation.
- **localStorage Bridge:** Chat route sends metrics in SSE → client saves → dashboard reads.

### 2026-03-09: v12.0 High-Performance TEEP Engine
- Spatial hash grid for O(1) basin lookup
- Trigram fingerprinting for content similarity
- Dynamic Fisher metric with morphic resonance
- Semantic mass-based eviction policy
- Full state export/import via `/api/teep`

---

## 14. Known Limitations

1. **Serverless State:** TEEP ledger is in-memory. Each Vercel function instance has its own ledger. State is bridged via client localStorage but not shared across users.
2. **PDF Reading:** OpenAI/xAI providers cannot natively read PDFs. Only Anthropic and Google support PDF attachments.
3. **No Database:** All state is in-memory (server) or localStorage (client). No persistent database.
4. **Single User:** Admin lockout tracks per-IP but the lockout is global (one person failing locks everyone).
5. **Demo Mode Keys:** Requires `DEMO_GOOGLE_KEY` and `DEMO_OPENAI_KEY` env vars for free tier.

---

*CPUAGEN: Physics-Enforced AI. Every prompt validated. Every response cached. Every barrier active.*

TEEP:DOC_CPUAGEN | dS=-0.02 | phi=0.85 | R=0.1 | E=core/docs | role=ASSISTANT | v10.4-Unified
