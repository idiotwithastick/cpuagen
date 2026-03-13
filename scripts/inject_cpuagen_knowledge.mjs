// Inject CPUAGEN public knowledge as pre-solved TEEPs into D1
const CF_ACCOUNT_ID = "e89a9f0be0874e1bae5a59c932940194";
const CF_API_TOKEN = "IBXhP_eEfWecwH6GiXYJmgsJFn-E2TZGAWbAfQay";
const DB_ID = "ba858e30-b625-4e54-ae28-44e232b2af87";

const qaTeeps = [
  { q: "What is CPUAGEN?", a: "CPUAGEN (cpuagen.com) is an AI assistant platform built on the SSD-RCI cognitive framework. It provides multi-provider LLM access with built-in quality enforcement, safety validation, and intelligent response caching. You can chat with Claude, GPT, Gemini, and Grok through a single interface, with a free demo tier requiring no API key." },
  { q: "What is SSD-RCI?", a: "SSD-RCI (Semantic State Derived Recursive Cognitive Integration) is a physics-based cognitive control framework developed by Wesley Foreman. It converts every AI input and output into a mathematical signature, validates it against 9 independent safety barriers, and caches validated responses for instant future retrieval. It uses real thermodynamics and information theory rather than heuristic rules." },
  { q: "Who created CPUAGEN?", a: "CPUAGEN was created by Wesley Foreman, the sole architect of the SSD-RCI framework. Contact: wforeman58@gmail.com | 217-565-3735. He is open to acquisition, licensing, and collaboration inquiries." },
  { q: "Is CPUAGEN free?", a: "Yes, CPUAGEN has a completely free demo tier using Gemini 2.0 Flash with no API key required. For access to Claude, GPT, Gemini Pro, or Grok models, you can bring your own API key from the respective provider." },
  { q: "What LLM providers does CPUAGEN support?", a: "CPUAGEN supports 4 major LLM providers: Anthropic (Claude Opus 4.6, Sonnet 4.6, Haiku 4.5), OpenAI (GPT-5.4, GPT-5.4 Pro, Codex 5.3, o3, o4-mini), Google (Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3.1 Flash Lite), and xAI (Grok 4.1 Reasoning, Grok 4.1 Fast, Grok Code). Plus a free demo tier." },
  { q: "How is CPUAGEN different from ChatGPT?", a: "CPUAGEN adds a physics-based quality and safety layer on top of any LLM. Every response is mathematically validated through 9 independent safety barriers before delivery. It provides multi-provider access through a single interface, intelligent caching for instant responses to previously-asked questions, plus built-in tools like code canvas and PDF markup." },
  { q: "Does CPUAGEN store my conversations?", a: "Conversations are stored locally in your browser localStorage. They are not sent to or stored on any CPUAGEN server. API keys also stay in your browser. The only data that persists server-side are anonymized mathematical signatures used for caching." },
  { q: "What is a TEEP?", a: "A TEEP (Thermodynamic Entropy Encoding Protocol) is a compact mathematical representation of a query-response pair. It captures the essential meaning of the exchange as a numerical signature that can be quickly matched against future queries. Think of it as a smart fingerprint for knowledge that enables instant cache matching and quality validation." },
  { q: "What is thermosolve?", a: "Thermosolve is the process of converting text into a mathematical signature using information-theoretic measures. It analyzes properties like information density, coherence, and structural patterns to create a compact numerical fingerprint. This signature enables instant cache matching and quality validation across all providers." },
  { q: "How does CPUAGEN caching work?", a: "CPUAGEN caches every validated query-response pair as a TEEP. When you ask a question, it first checks the cache using a multi-stage lookup: exact match, near match, partial match, or no match. Cache hits return in under 5ms without making an API call, saving both time and API costs." },
  { q: "What are Control Barrier Functions?", a: "Control Barrier Functions (CBFs) are 9 independent safety checks that every AI response must pass before delivery. They validate truthfulness, naturalness, energy bounds, thermal equilibrium, coherence, error bounds, quality metrics, and synergy. All 9 must pass. If any single barrier flags an issue, the response is annotated with what was flagged." },
  { q: "What is the enforcement pipeline?", a: "The enforcement pipeline has 3 stages: (1) Pre-enforcement analyzes your query and checks the TEEP cache for instant matches; (2) LLM processing sends your query to the chosen provider with real-time streaming; (3) Post-enforcement validates the response through 9 safety barriers and caches the validated pair for future instant retrieval." },
  { q: "What is the code canvas?", a: "CPUAGEN code canvas auto-activates when the AI generates code. It provides syntax highlighting for 50+ languages, live editing, AI-assisted code modifications, one-click copy/download, and multi-file handling. You can select code and ask the AI to modify specific sections directly in the canvas." },
  { q: "What is GreyBeam?", a: "GreyBeam is CPUAGEN built-in PDF markup and annotation system. It offers 14 annotation tools (lines, arrows, circles, rectangles, clouds, polylines, freehand, callouts, highlights, hatching, stamps, counting, measurement, text), 8 stamp types, measurement tools with configurable scale, full color picker, undo/redo, and PDF export." },
  { q: "What file types can I upload to CPUAGEN?", a: "CPUAGEN supports: Images (PNG, JPEG, GIF, WebP), Documents (PDF, Word .doc/.docx), Spreadsheets (Excel .xls/.xlsx), Text (plain text, Markdown, CSV), Code (Python, JavaScript, TypeScript, and 30+ other languages), and Data (JSON, XML, HTML, CSS). Maximum 20 MB per file, up to 5 files per message." },
  { q: "How fast is CPUAGEN?", a: "Cache hit responses return in under 5ms. Full LLM responses start streaming in 200-800ms depending on the provider. The enforcement pipeline adds less than 15ms overhead. Safety barrier validation completes in under 2ms for all 9 barriers. Deployed on Cloudflare Workers at the global edge for low latency worldwide." },
  { q: "What is the AGF protocol?", a: "AGF (Anti-Goodhart First) is the protocol that checks the TEEP cache before calling the LLM. It follows a multi-stage lookup: exact hash match, near-semantic match, partial match interpolation, or full LLM call with real-time solving. This ensures maximum cache utilization and minimum unnecessary API calls." },
  { q: "Is SSD-RCI open source?", a: "The core SSD-RCI framework is proprietary intellectual property of Wesley Foreman. CPUAGEN at cpuagen.com is the public-facing application that demonstrates its capabilities. Licensing inquiries are welcome at wforeman58@gmail.com." },
  { q: "What technology stack does CPUAGEN use?", a: "CPUAGEN uses Next.js 15 with App Router, TypeScript throughout, Tailwind CSS for styling, Cloudflare Workers + D1 for the backend API and database, deployed on Vercel (frontend) + Cloudflare global edge network (API/data). Fully serverless architecture with no servers to manage." },
  { q: "How does physics-based AI safety work?", a: "Instead of hand-written rules or trained classifiers, SSD-RCI uses mathematical constraints from thermodynamics and information theory. Every text is converted to a thermodynamic signature measuring information density, coherence, and structure. These signatures are validated against mathematically provable safety constraints that cannot be gamed through clever prompting." },
  { q: "What is multi-LLM orchestration?", a: "CPUAGEN can orchestrate multiple LLM providers simultaneously for consensus checking, specialized routing, fallback handling, and quality comparison. It currently supports 5+ providers including cloud APIs and local models. All providers are validated through the same physics-based enforcement pipeline for consistent quality." },
  { q: "How does CPUAGEN handle API keys?", a: "API keys are stored exclusively in your browser localStorage. They are never sent to CPUAGEN servers. They go directly from the edge worker to the respective provider API endpoint. CPUAGEN never stores, logs, or transmits your keys anywhere except to the provider you selected." },
  { q: "What is a basin in SSD-RCI?", a: "A basin is a stable attractor state in the thermodynamic landscape. It represents a solved problem: a query-response pair that has converged to a mathematically stable point. Once a basin is found, any future query that maps to the same region of the landscape returns the cached solution instantly." },
  { q: "What domains does the TEEP cache cover?", a: "The TEEP cache covers 50+ domains including programming (Python, JavaScript, TypeScript, React, Node.js, Rust, Go), AI/ML, databases, DevOps, system design, algorithms, data structures, mathematics, cloud computing, security, networking, and many more. The cache grows continuously as new queries are solved." },
  { q: "Can I use CPUAGEN for coding?", a: "Yes, CPUAGEN is excellent for coding tasks. It supports all major LLMs optimized for code, includes a built-in code canvas with syntax highlighting for 50+ languages, supports file attachments for code review, and has pre-solved TEEP cache entries covering programming topics across dozens of languages and frameworks." },
];

function computeThermosolve(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const n = tokens.length || 1;
  const freq = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  const probs = Object.values(freq).map(c => c / n);
  const S = -probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
  const maxS = Math.log2(Object.keys(freq).length || 1);
  const phi = maxS > 0 ? S / maxS : 0;
  const uniform = 1 / (Object.keys(freq).length || 1);
  const dkl = probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p / uniform) : 0), 0);
  const chars = text.split("");
  const trigrams = {};
  for (let i = 0; i < chars.length - 2; i++) {
    const tri = chars.slice(i, i + 3).join("");
    trigrams[tri] = (trigrams[tri] || 0) + 1;
  }
  const triVals = Object.values(trigrams);
  const triTotal = triVals.reduce((a, b) => a + b, 0) || 1;
  const triProbs = triVals.map(v => v / triTotal);
  const triEntropy = -triProbs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
  const windowSize = Math.min(10, tokens.length);
  let gradientSum = 0;
  if (tokens.length >= 2) {
    for (let i = 0; i <= tokens.length - windowSize; i++) {
      const win = tokens.slice(i, i + windowSize);
      const wFreq = {};
      for (const t of win) wFreq[t] = (wFreq[t] || 0) + 1;
      const wProbs = Object.values(wFreq).map(c => c / win.length);
      const wS = -wProbs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);
      gradientSum += Math.abs(wS - S);
    }
  }
  const dS = tokens.length >= 2 ? gradientSum / Math.max(1, tokens.length - windowSize + 1) : 0;
  return { n, S: +S.toFixed(6), phi: +phi.toFixed(6), dkl: +dkl.toFixed(6), dS: +dS.toFixed(6), trigramEntropy: +triEntropy.toFixed(6) };
}

function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    }
  );
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors));
  return data.result;
}

async function main() {
  console.log(`Injecting ${qaTeeps.length} CPUAGEN knowledge TEEPs into D1...`);
  let injected = 0, skipped = 0;
  for (const { q, a } of qaTeeps) {
    const sig = computeThermosolve(q);
    const basinKey = fnv1aHash(q.toLowerCase().trim());
    const teepId = `CPUAGEN-PUB-${basinKey}`;
    const content = `Q: ${q}\nA: ${a}`;
    try {
      await d1Query(
        "INSERT OR IGNORE INTO teeps (id, content, category, signature_json, created_at) VALUES (?, ?, ?, ?, ?)",
        [teepId, content, "CPUAGEN_KNOWLEDGE", JSON.stringify(sig), new Date().toISOString()]
      );
      await d1Query(
        "INSERT OR IGNORE INTO basins (basin_key, teep_id, prompt_hash, signature_json, response_preview, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [basinKey, teepId, basinKey, JSON.stringify(sig), a.slice(0, 200), new Date().toISOString()]
      );
      injected++;
      process.stdout.write(`  ${injected}/${qaTeeps.length}\r`);
    } catch (e) {
      skipped++;
      console.error(`  Skip ${teepId}: ${e.message}`);
    }
  }
  const [teepCount] = await d1Query("SELECT COUNT(*) as c FROM teeps");
  const [basinCount] = await d1Query("SELECT COUNT(*) as c FROM basins");
  console.log(`\nDone: ${injected} injected, ${skipped} skipped`);
  console.log(`D1 totals: ${teepCount[0].results[0].c} TEEPs, ${basinCount[0].results[0].c} basins`);
}

main().catch(console.error);
