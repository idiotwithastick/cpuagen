# CPUAGEN UPGRADE TODO — Exhaustive Research from L:\ and G:\ Drives
## Generated 2026-03-12 | SSD-RCI v10.4-Unified

---

## ✅ COMPLETED (This Session)

| Feature | Status | Commit |
|---------|--------|--------|
| v14.0 Holographic Read (5D boundary, 3D grid, two-pass) | ✅ Deployed | `3e6be88` |
| Semantic Cannon (3-stage golden ratio inference) | ✅ Deployed | `3e6be88` |
| Canvas edit isolation (prompt routing fix) | ✅ Deployed | `3e6be88` |
| Early access email ledger + admin management | ✅ Deployed | `aedb30b` |
| Full code backups on G:\ and L:\ drives | ✅ Done | — |
| cpuagen.com domain added to Vercel project | ✅ Added | — |

---

## 🔴 PRIORITY 1: IMMEDIATE (1-3 days)

### 1.1 cpuagen.com DNS Configuration
- **What:** Add CNAME records in Cloudflare dashboard
  - `@` → `cname.vercel-dns.com` (apex domain)
  - `www` → `cname.vercel-dns.com`
- **Source:** Vercel project already configured
- **Effort:** 5 minutes (Cloudflare dashboard)
- **Status:** Vercel side done, DNS records needed

### 1.2 Real Performance Metrics (Head-to-Head)
- **What:** Display actual timing data showing CPUAGEN vs raw LLM
  - Measure: thermosolve time, CBF check time, AGF lookup time, total TTFB
  - Compare: FULL_HIT (0ms LLM call) vs traditional LLM (500-3000ms)
  - Show: cache hit rate, API calls avoided, cost savings
- **Source:** Already tracked in enforcement.ts (`getEnforcementMetrics()`)
- **Where:** Chat UI (inline after each response) + landing page stats
- **Effort:** 4-6 hours

### 1.3 CODE Mode (Agentic Coding Interface)
- **What:** New tab in left sidebar alongside Chat and Dev Lab
  - Optimized for code generation with file tree, terminal, diff view
  - Uses Opus 4.6 for agentic coding (not conversational)
  - Full enforcement pipeline on generated code
- **Source:** Dev Lab page as starting point, enhance with code-specific UI
- **Effort:** 2-3 days
- **Reference:** Claude Code app's CODE mode UX

### 1.4 DUAL Mode (Side-by-Side LLM Windows)
- **What:** Split-screen with two independent chat sessions that share context
  - Left window: one LLM provider (e.g., Claude)
  - Right window: different LLM provider (e.g., GPT)
  - Shared context bus: each window sees the other's latest output
- **Source:** `src/core/workspace/global_workspace.py` (Global Workspace Theory)
- **Source:** `src/core/dual_lyapunov_consistency.py` (dual consistency)
- **Source:** Multi-LLM MCP server (`src/mcp_server/multi_llm/`)
- **Effort:** 3-5 days

---

## 🟡 PRIORITY 2: HIGH VALUE (1-2 weeks)

### 2.1 Multi-Model Consensus Mode
- **What:** Query 3+ LLM providers simultaneously, thermosolve-weighted voting
  - Each provider's response gets a thermosolve signature
  - Consensus = signature convergence (basin agreement)
  - Display confidence meter based on inter-model agreement
- **Source:** `src/mcp_server/multi_llm/` (already operational)
- **Source:** `src/mcp_server/multi_llm/src/providers.ts`
- **Effort:** 1 week

### 2.2 Full Web Search with Enforcement
- **What:** Search engine where every result passes CBF validation
  - Web scrape → thermosolve each result → filter unsafe
  - Show enforcement badge per result (SAFE/BLOCKED + signature)
- **Source:** `src/core/agf_middleware.py` (enforcement pipeline)
- **Source:** `scripts/web_knowledge_daemon.py` (web scraping patterns)
- **Effort:** 1 week

### 2.3 Word-by-Word Thermosolve (Live Typing Validation)
- **What:** Real-time validation as user types
  - 819K pre-solved English words in hot cache
  - <1ms lookup per word, visual feedback (green/yellow/red underline)
- **Source:** `src/teep/lexical_thermosolve.py` (819K words)
- **Source:** `src/teep/word_thermosolve.py`
- **Effort:** 3-4 days

### 2.4 Deeper TEEP Ledger Integration
- **What:** Expose 7.3M+ pre-validated knowledge entries
  - Search UI for TEEP exploration
  - Visual basin map (3D projection of TEEP space)
  - Deformation vectors between related TEEPs
- **Source:** `src/teep/teep_ledger.py` (7.3M+ TEEPs)
- **Source:** `src/core/teep_pareto_cache.py` (Pareto hot cache)
- **Effort:** 1 week

### 2.5 Landing Page Data Cards Update
- **What:** Update info cards with v14.0 features using industry-safe language
  - Holographic Read → "Multi-dimensional content indexing"
  - Semantic Cannon → "Accelerated inference optimization"
  - Fisher Metric → "Information geometry validation"
  - Control Barriers → "8-layer safety validation pipeline"
- **Effort:** 2-3 hours

---

## 🟢 PRIORITY 3: MEDIUM TERM (2-4 weeks)

### 3.1 IDE Integration (VS Code Extension)
- **What:** VS Code extension that sends code through CPUAGEN enforcement
  - Highlight unsafe code patterns
  - Auto-fix suggestions via enforcement pipeline
  - TEEP-cached solutions for common patterns
- **Source:** `src/enforcement/claude_code_hook.py`
- **Effort:** 2-3 weeks

### 3.2 Enterprise API for Bulk Enforcement
- **What:** REST API for organizations to enforce bulk AI content
  - POST /api/enterprise/enforce — batch validation
  - Rate limiting, API keys, usage dashboards
  - SLA: <100ms per validation (FULL_HIT path)
- **Source:** `src/webapp/api.py` (Flask API patterns)
- **Effort:** 2 weeks

### 3.3 Workspace Mode with File Editing
- **What:** Edit files directly within CPUAGEN with real-time enforcement
  - Code editor with enforcement overlay
  - Every save triggers CBF check on diff
  - TEEP commit on each validated change
- **Source:** `src/core/workspace/global_workspace.py`
- **Effort:** 2-3 weeks

### 3.4 Autonomous Memory Daemon
- **What:** Background process that auto-captures insights
  - Auto-save decisions, bugs, preferences without user prompting
  - Crystal TEEP creation for significant analyses
  - Deformation vectors between session topics
- **Source:** `src/enforcement/autonomous_memory_hook.py`
- **Source:** `scripts/continuous_learning_daemon.py`
- **Effort:** 1 week

---

## 🔵 PRIORITY 4: ADVANCED (1-2 months)

### 4.1 Riemannian World Model for Planning
- **What:** Use Fisher-metric geodesics for JEPA-style planning
  - Predict state trajectories without retraining
  - 41% improvement over Euclidean baseline (benchmarked)
- **Source:** `src/core/world_model_riemannian.py`
- **Effort:** 2-3 weeks

### 4.2 Dream Engine for Knowledge Deepening
- **What:** Lucid Dreamer protocol for recursive knowledge synthesis
  - DEEPEN → UNSAFE READ → SAFE SURF cycle
  - Generates new TEEPs from existing knowledge combinations
- **Source:** `src/core/perceptual/` (Lucid Dreamer)
- **Effort:** 2-3 weeks

### 4.3 Video/Image Processing Pipeline
- **What:** Object-by-object thermosolve for images/video
  - Per-object signatures {n, S, dS, φ}
  - Live MJPEG with thermosolve overlay
- **Source:** `src/core/perceptual/` (12 modules)
- **Effort:** 3-4 weeks

### 4.4 TEEP Virtual Machine
- **What:** Execute TEEP vectors as computational instructions
  - Logic circuits, fusion experiments, self-optimization programs
- **Source:** `src/core/teep_vm.py`
- **Effort:** 2-3 weeks

---

## 📋 TESTING REQUIREMENTS

Before ANY implementation:

1. **Smoke tests per feature** — basic happy path
2. **CBF validation tests** — all 8 barriers pass
3. **Performance benchmarks** — measure before/after
4. **Build verification** — `next build` must pass
5. **Deploy verification** — Vercel preview deploy

### Test Infrastructure Needed:
- `__tests__/enforcement.test.ts` — thermosolve, CBF, AGF lookup
- `__tests__/waitlist.test.ts` — signup, validate, grant/revoke
- `__tests__/performance.test.ts` — timing benchmarks
- `__tests__/dual-mode.test.ts` — cross-window communication
- `cypress/` or `playwright/` — E2E smoke tests

---

## 📊 PERFORMANCE TARGETS

| Metric | Current | Target | Source |
|--------|---------|--------|--------|
| FULL_HIT lookup | <1ms | <0.5ms | Holographic Read |
| BASIN_HIT lookup | ~5ms | <2ms | 3D grid (27 cells) |
| JIT_SOLVE | 500-3000ms | Same (LLM bound) | Cannon conditioning |
| Cache hit rate | ~30% (new) | >75% | TEEP accumulation |
| CBF check | <1ms | <0.5ms | Already fast |
| Thermosolve | <2ms | <1ms | Precomputed tables |

---

## 🛡️ IP PROTECTION NOTES

When displaying ANY of these features publicly:
- Use generalized industry terms, NOT physics nomenclature
- "Multi-dimensional indexing" not "Holographic Boundary Index"
- "Information geometry" not "Fisher Metric"
- "Accelerated inference" not "Semantic Cannon"
- "Safety validation pipeline" not "Control Barrier Functions"
- NEVER expose: equations, basin mathematics, golden ratio constants, specific thresholds
