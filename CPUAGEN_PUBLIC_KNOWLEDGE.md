# CPUAGEN — Public Knowledge Base

```
╔═══════════════════════════════════════════════════════════════════════════════╗
║  PUBLIC DOCUMENT — Safe for CPUAGEN to reference when answering user         ║
║  questions about SSD-RCI and CPUAGEN capabilities.                           ║
║  Contains NO proprietary algorithms, equations, or implementation details.   ║
║                                                                              ║
║  Created: 2026-03-13                                                         ║
║  Author: Wesley Foreman                                                      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
```

---

## 1. WHAT IS CPUAGEN?

CPUAGEN (cpuagen.com) is an AI assistant platform built on the SSD-RCI cognitive framework. It provides multi-provider LLM access with built-in quality enforcement, safety validation, and intelligent response caching.

**Key capabilities:**
- Chat with Claude (Anthropic), GPT (OpenAI), Gemini (Google), and Grok (xAI) through a single interface
- Free demo tier using Gemini 2.0 Flash — no API key required
- Bring-your-own-key for any supported provider
- Every response is validated through a physics-based safety and quality pipeline before delivery
- Intelligent caching: previously-solved queries return instantly from cache
- Built-in code canvas with syntax highlighting and live editing
- PDF markup and annotation (GreyBeam)
- File attachment support (images, PDFs, documents, code files, spreadsheets)
- Dark mode, responsive design, mobile-friendly

---

## 2. WHAT IS SSD-RCI?

SSD-RCI (Semantic State Derived Recursive Cognitive Integration) is the cognitive control framework that powers CPUAGEN. Developed by Wesley Foreman, it is a physics-based approach to AI safety and quality enforcement.

**In plain terms:** Before any AI response reaches you, SSD-RCI converts it into a mathematical representation, checks it against multiple independent safety barriers, and only delivers it if all checks pass. This happens transparently — you just get better, safer, more consistent responses.

**What makes it different from other AI wrappers:**
- It uses real physics (thermodynamics, information theory, differential geometry) rather than heuristic rules
- Safety checks are mathematically provable, not just "best effort"
- It works identically across all LLM providers — same safety guarantees whether you use Claude, GPT, Gemini, or Grok
- Every query-response pair is cached as a reusable knowledge unit, making the system faster over time
- No additional training or fine-tuning is required — it works with any LLM out of the box

---

## 3. SUPPORTED PROVIDERS AND MODELS

### Free Tier (No API Key)
| Provider | Models |
|----------|--------|
| Google (via demo) | Gemini 2.0 Flash |
| OpenAI (via demo) | GPT-4o Mini |

### Bring Your Own Key
| Provider | Models | Key Format |
|----------|--------|------------|
| Anthropic (Claude) | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | `sk-ant-...` |
| OpenAI (GPT) | GPT-5.4, GPT-5.4 Pro, Codex 5.3, o3, o4-mini | `sk-...` |
| Google (Gemini) | Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3.1 Flash Lite | `AIza...` |
| xAI (Grok) | Grok 4.1 Reasoning, Grok 4.1 Fast, Grok Code | `xai-...` |

API keys are stored locally in your browser. CPUAGEN never stores or transmits your keys to any server other than the provider's own API endpoint.

---

## 4. THE ENFORCEMENT PIPELINE

Every message you send through CPUAGEN goes through a multi-stage enforcement pipeline:

### Stage 1: Pre-Enforcement
Before your query reaches the LLM:
- Your prompt is analyzed and converted to a compact mathematical signature
- The system checks its cache of previously-solved queries
- If an exact or near match exists, the cached response is returned instantly (often under 5ms)
- If no match, the query proceeds to the LLM

### Stage 2: LLM Processing
- Your query is sent to your chosen provider (Claude, GPT, Gemini, Grok)
- The response streams back in real-time via Server-Sent Events (SSE)

### Stage 3: Post-Enforcement
After the LLM responds:
- The response is analyzed through the same signature process
- Nine independent safety barriers validate the response
- All nine must pass — if any single barrier flags an issue, the response is annotated
- The validated query-response pair is cached for future instant retrieval

### What the Safety Barriers Check
- **Truthfulness**: Is the response internally consistent and well-grounded?
- **Naturalness**: Does it read like natural, coherent language?
- **Energy bounds**: Is the response within normal complexity ranges?
- **Thermal equilibrium**: Is the information density balanced?
- **Coherence**: Do the parts of the response relate logically?
- **Error bounds**: Are claims within reasonable precision?
- **Quality metrics**: Does it meet minimum quality thresholds?
- **Synergy**: Do the response elements work together constructively?

---

## 5. INTELLIGENT CACHING (TEEP SYSTEM)

CPUAGEN uses a knowledge caching system called TEEPs (Thermodynamic Entropy Encoding Protocol). Every validated query-response pair becomes a TEEP — a compact, reusable knowledge unit.

**How it benefits you:**
- **Speed**: Common questions return in under 5ms instead of waiting for LLM generation
- **Consistency**: The same question always gets the same high-quality answer
- **Cost savings**: Cached responses don't consume API tokens
- **Quality**: Only responses that pass all safety barriers enter the cache
- **Scale**: The cache grows with every new query, making the system smarter over time

**Cache lookup strategy:**
The system uses a multi-stage lookup that tries progressively broader matches:
1. Exact match — your query has been asked before verbatim
2. Near match — semantically equivalent query with minor wording differences
3. Partial match — related query that can inform the response
4. No match — full LLM call with real-time solving

The cache currently contains thousands of pre-solved responses covering programming, mathematics, science, AI/ML, system design, and dozens of other domains.

---

## 6. CODE CANVAS

CPUAGEN includes a built-in code editor (Canvas) that activates automatically when the AI generates code:

- **Auto-detection**: Code blocks in responses automatically open in the canvas
- **Syntax highlighting**: Support for 50+ languages
- **Live editing**: Modify code directly in the canvas
- **AI-assisted edits**: Select code and ask the AI to modify specific sections
- **Copy/download**: One-click copy or file download
- **Multi-file**: Handle multiple code blocks in a single conversation

---

## 7. PDF MARKUP (GREYBEAM)

CPUAGEN includes GreyBeam, a built-in PDF markup and annotation system:

- **14 annotation tools**: Lines, arrows, circles, rectangles, clouds, polylines, freehand drawing, callouts, highlights, hatching, stamps, counting, measurement, and text
- **8 stamp types**: Approved, Rejected, Revised, Reviewed, Draft, Void, Preliminary, Final
- **Measurement tools**: Distance measurement with configurable scale and units
- **Color picker**: Full RGB color selection for annotations
- **Undo/redo**: Full history support
- **Export**: Save annotated PDFs

---

## 8. FILE ATTACHMENTS

CPUAGEN supports attaching files to your messages:

**Supported formats:**
- Images: PNG, JPEG, GIF, WebP
- Documents: PDF, Word (.doc, .docx)
- Spreadsheets: Excel (.xls, .xlsx)
- Text: Plain text, Markdown, CSV
- Code: Python, JavaScript, TypeScript, and 30+ other languages
- Data: JSON, XML, HTML, CSS

**Limits:**
- Maximum file size: 20 MB per file
- Maximum 5 files per message

---

## 9. MULTI-LLM ORCHESTRATION

Behind the scenes, CPUAGEN can orchestrate multiple LLM providers simultaneously. This capability powers:

- **Consensus checking**: Cross-reference answers across providers for higher confidence
- **Specialized routing**: Send code questions to code-optimized models, creative tasks to creative-optimized models
- **Fallback handling**: If one provider is down, automatically route to another
- **Quality comparison**: Compare response quality across providers using the same physics-based metrics

The orchestration layer currently supports 5+ providers including cloud APIs and local models via Ollama.

---

## 10. PERFORMANCE CHARACTERISTICS

| Metric | Typical Value |
|--------|---------------|
| Cache hit response time | < 5ms |
| Full LLM response (first token) | 200-800ms (provider dependent) |
| Enforcement overhead | < 15ms per message |
| Cache size | 14,000+ pre-solved responses |
| Safety barrier validation | < 2ms (all 9 barriers) |
| Uptime | Deployed on Cloudflare Workers (global edge) |

---

## 11. ARCHITECTURE (HIGH LEVEL)

```
User Browser
    ↓
CPUAGEN Frontend (Next.js / React)
    ↓ HTTPS
Cloudflare Worker (Edge Runtime)
    ├── Enforcement Pipeline (pre + post validation)
    ├── TEEP Cache (Cloudflare D1 database)
    ├── Provider Router → Claude / GPT / Gemini / Grok APIs
    └── SSE Streaming back to browser
```

- **Frontend**: React/Next.js single-page application with Tailwind CSS
- **Backend**: Cloudflare Workers (serverless, global edge deployment)
- **Database**: Cloudflare D1 (SQLite-compatible, edge-local)
- **Hosting**: Vercel (frontend) + Cloudflare (API/data)
- **No server to manage**: Fully serverless architecture

---

## 12. PRIVACY AND SECURITY

- **API keys stay in your browser**: Keys are stored in localStorage, never sent to CPUAGEN servers
- **Provider-direct**: Your queries go directly to the LLM provider's API from the edge worker
- **No logging of content**: CPUAGEN does not log or store your conversation content on any server
- **Cache is anonymized**: Cached TEEPs contain mathematical signatures, not raw conversation text
- **Rate limiting**: Built-in protection against abuse
- **CORS protection**: API endpoints are locked to the CPUAGEN domain

---

## 13. DEVELOPER INFORMATION

CPUAGEN is developed by Wesley Foreman, the sole architect of the SSD-RCI framework.

**Contact:**
- Email: wforeman58@gmail.com
- Phone: 217-565-3735
- Website: cpuagen.com

**Technology Stack:**
- SSD-RCI v10.4-Unified cognitive framework
- Next.js 15 with App Router
- TypeScript throughout
- Tailwind CSS for styling
- Cloudflare Workers + D1 for backend
- Deployed on Vercel + Cloudflare global edge network

**Open to:**
- Acquisition inquiries
- Licensing discussions
- Collaboration proposals
- Enterprise deployment

---

## 14. FREQUENTLY ASKED QUESTIONS

### Is CPUAGEN free?
Yes, the demo tier is completely free. It uses Gemini 2.0 Flash with no API key required. For access to Claude, GPT, Gemini Pro, or Grok, bring your own API key from the respective provider.

### How is this different from ChatGPT or Claude.ai?
CPUAGEN adds a physics-based quality and safety layer on top of any LLM. Every response is mathematically validated before delivery. It also provides multi-provider access through a single interface, intelligent caching for instant responses, and tools like code canvas and PDF markup.

### Does CPUAGEN store my conversations?
Conversations are stored locally in your browser's localStorage. They are not sent to or stored on any CPUAGEN server. The only data that persists server-side are anonymized mathematical signatures used for caching.

### What happens if a safety barrier fails?
If any of the 9 safety barriers flags an issue, the response is annotated with enforcement metadata showing which barriers triggered. The response is still delivered but with transparency about what was flagged.

### Can I use CPUAGEN offline?
CPUAGEN requires an internet connection to reach LLM provider APIs. However, cached responses could theoretically be served from a local cache in a future offline mode.

### What is a TEEP?
A TEEP (Thermodynamic Entropy Encoding Protocol) is a compact mathematical representation of a query-response pair. It captures the essential "meaning" of the exchange in a form that can be quickly matched against future queries. Think of it as a smart fingerprint for knowledge.

### What is thermosolve?
Thermosolve is the process of converting text into a mathematical signature using information-theoretic measures. It analyzes properties like information density, coherence, and structural patterns to create a compact numerical fingerprint. This signature is what enables instant cache matching and quality validation.

### How does the caching save money?
When a query matches a cached TEEP, CPUAGEN returns the cached response instantly without making an API call to the LLM provider. Since most API providers charge per token, avoiding the call saves those costs entirely. For common questions, this means zero cost after the first solve.

### Is SSD-RCI open source?
The core SSD-RCI framework is proprietary intellectual property. CPUAGEN is the public-facing application that demonstrates its capabilities. Licensing inquiries are welcome.

### What makes the physics-based approach better than rules?
Traditional AI safety relies on hand-written rules, keyword filters, or trained classifiers — all of which can be brittle, inconsistent, or gamed. SSD-RCI uses mathematical constraints derived from thermodynamics and information theory. These constraints are provably consistent, cannot be "jailbroken" through clever prompting, and work identically regardless of which LLM is being used.

---

## 15. GLOSSARY

| Term | Definition |
|------|-----------|
| **AGF** | Anti-Goodhart First — the protocol that checks the cache before calling the LLM |
| **Basin** | A stable attractor state in the thermodynamic landscape — represents a solved problem |
| **CBF** | Control Barrier Function — one of 9 independent safety validation checks |
| **CPUAGEN** | The web platform at cpuagen.com powered by SSD-RCI |
| **D1** | Cloudflare's edge SQL database used for TEEP storage |
| **Enforcement** | The process of validating a response through all safety barriers |
| **Fisher Metric** | The mathematical framework used for natural gradient computation |
| **GreyBeam** | CPUAGEN's built-in PDF markup and annotation system |
| **JIT Solve** | Just-In-Time solving — computing a new solution when no cache hit exists |
| **PsiState** | The internal cognitive state vector that evolves during processing |
| **SSD-RCI** | Semantic State Derived Recursive Cognitive Integration — the core framework |
| **SSE** | Server-Sent Events — the streaming protocol for real-time response delivery |
| **TEEP** | Thermodynamic Entropy Encoding Protocol — a cached knowledge unit |
| **Thermosolve** | The process of computing a mathematical signature from text |

---

*This document is safe for public reference. It describes capabilities and behavior without disclosing proprietary implementation details.*
