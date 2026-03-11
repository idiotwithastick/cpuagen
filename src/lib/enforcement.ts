// ========================================================================
// SSD-RCI PHYSICS ENFORCEMENT — TypeScript Port (v11.0-Q Morphic Resonance)
// ========================================================================
// Implements: Thermosolve signatures, CBF barrier series, PsiState evolution,
//             AGF cache-first lookup, TEEP ledger persistence
//             + Dynamic Fisher Metric (habit formation via geodesic convergence)
//             + Semantic Mass (Ricci curvature-based TEEP weighting)
//             + Morphic Resonance (cross-query habit strengthening)
// Source: core/physics_engine.py, core/control_barrier_engine.py,
//         core/agf_middleware.py, L:/GPAI Research/Phase 3 Morphic Resonance
// ========================================================================

// ---------- Types ----------

interface InternalSignature {
  n: number;              // Particle count (word count)
  S: number;              // Shannon entropy (system entropy)
  dS: number;             // Entropy gradient (convergence metric)
  phi: number;            // Phase coherence (unique word ratio)
  I_truth: number;        // Truth integration (information density)
  naturality: number;     // Natural language score (KL vs English)
  energy: number;         // Complexity energy bound
  beta_T: number;         // Inverse temperature (thermal equilibrium)
  psi_coherence: number;  // Multi-scale coherence
  error_count: number;    // Structural error count
  Q_quality: number;      // Quality factor
  synergy: number;        // System synergy index
  cache_hit: number;      // 1 if TEEP cache hit, 0 if miss
  [key: string]: number;
}

interface InternalBarrierScheme {
  safe: boolean;
  value: number;
}

interface InternalBarrierResult {
  [key: string]: InternalBarrierScheme | boolean;
  allSafe: boolean;
}

// ---------- 26-Dimensional PsiState ----------

interface PsiState {
  cycle: number;
  S: number;
  delta_H_sem: number;
  S_CTS: number;
  psi_coherence: number;
  phi_phase: number;
  I_truth: number;
  E_meta: number;
  R_curv: number;
  lambda_flow: number;
  beta_T: number;
  kappa: number;
  sigma_noise: number;
  alpha: number;
  delta_S_adaptation: number;
  x: [number, number, number, number];
  v: [number, number, number, number];
  theta: [number, number, number, number];
  time: number;
}

// Global PsiState — evolves with each enforcement request
// dψ/dt = -η∇S[ψ] (gradient descent on entropy)
let psiState: PsiState = {
  cycle: 0, S: 4.0, delta_H_sem: 0, S_CTS: 1.0,
  psi_coherence: 0.8, phi_phase: 0.5, I_truth: 0.7,
  E_meta: 100, R_curv: 0.1, lambda_flow: 0.5,
  beta_T: 1.0, kappa: 0.9, sigma_noise: 0.05,
  alpha: 0.01, delta_S_adaptation: 0,
  x: [0, 0, 0, 0], v: [0, 0, 0, 0], theta: [0, 0, 0, 0],
  time: 0,
};

// ---------- TEEP Ledger (in-memory cache) ----------

interface CachedTeep {
  id: string;
  signature: InternalSignature;
  cbfResult: { allSafe: boolean };
  content_hash: string;
  content: string;           // Actual response content — AGF serves this directly
  input_hash?: string;       // Hash of the input that generated this response
  created: number;
  hits: number;
  // v11.0-Q Morphic Resonance fields
  semanticMass: number;      // m_s: Ricci curvature-based weight — heavy TEEPs resist eviction
  resonanceStrength: number; // R(ψ): How much this basin has been reinforced by repeated access
  lastResonance: number;     // Timestamp of last morphic reinforcement
}

const teepLedger = new Map<string, CachedTeep>();
// Basin index: maps input hashes to response content hashes for AGF lookup
const basinIndex = new Map<string, string>();
let teepCounter = Date.now() % 1000000;
let cacheHits = 0;
let cacheMisses = 0;
// AGF Protocol tracking
let agfFullHits = 0;
let agfBasinHits = 0;
let agfJitSolves = 0;
let agfApiCallsAvoided = 0;

// ========================================================================
// v11.0-Q DYNAMIC FISHER METRIC — "The metric thickens where truth lives"
// ========================================================================
// g_ij(t+Δt) = g_ij(t) + η * ∫ R(ψ) dγ
// As TEEPs get hit, the Fisher metric weights in those dimensions increase,
// making the basin "deeper" and easier to fall into on similar queries.
// This IS the Morphic Resonance: the habit of truth becomes the path of
// least resistance.
// ========================================================================

const MORPHIC_LEARNING_RATE = 0.05; // η_R: How fast habits form

// Dynamic Fisher metric weights — these EVOLVE with each successful hit
const dynamicFisherWeights = {
  S: 1.0,
  phi: 2.0,
  I_truth: 1.5,
  naturality: 1.0,
  beta_T: 0.8,
  psi_coherence: 1.5,
  synergy: 1.0,
};

// Morphic field state — tracks the resonance of the manifold
let morphicFieldStrength = 0;  // Total accumulated resonance
let totalResonanceEvents = 0;  // How many times habits have been reinforced

// ---------- English Character Frequency Reference ----------
// Brown Corpus + Wikipedia analysis for naturality scoring

const ENGLISH_FREQ: Record<string, number> = {
  " ": 0.183, e: 0.102, t: 0.075, a: 0.065, o: 0.061,
  i: 0.057, n: 0.057, s: 0.051, h: 0.050, r: 0.050,
  d: 0.033, l: 0.033, c: 0.022, u: 0.022, m: 0.020,
  w: 0.019, f: 0.018, g: 0.016, y: 0.015, p: 0.015,
  b: 0.012, v: 0.008, k: 0.006, j: 0.001, x: 0.001,
  q: 0.001, z: 0.001,
};

// Common English filler/stop words (not information-bearing)
const FILLER_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "it", "its", "this", "that",
  "and", "or", "but", "not", "no", "so", "if", "as", "than", "then",
  "my", "your", "his", "her", "we", "they", "me", "him", "us", "them",
]);

// ---------- Helper: Shannon Entropy ----------

function shannonEntropy(text: string): number {
  if (text.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  let S = 0;
  for (const count of freq.values()) {
    const p = count / text.length;
    if (p > 0) S -= p * Math.log2(p);
  }
  return S;
}

// ---------- Helper: Likely English Word ----------
// English words have vowels and limited consonant clustering

function isLikelyWord(w: string): boolean {
  const alpha = w.toLowerCase().replace(/[^a-z]/g, "");
  if (alpha.length === 0) return false;
  // Single chars that aren't 'a' or 'i' are not meaningful words
  if (alpha.length === 1 && alpha !== "a" && alpha !== "i") return false;
  // Words > 2 chars almost always have vowels in English
  const hasVowel = /[aeiouy]/.test(alpha);
  if (!hasVowel && alpha.length > 2) return false;
  // English rarely has > 4 consecutive consonants
  const clusters = alpha.match(/[^aeiouy]+/g) || [];
  const maxCluster = clusters.reduce((m, s) => Math.max(m, s.length), 0);
  if (maxCluster > 4) return false;
  return true;
}

// ---------- Helper: Content Hash (FNV-1a) ----------

function fnv1aHash(content: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = (hash * 0x01000193) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ========================================================================
// THERMOSOLVE — Full thermodynamic signature extraction
// ========================================================================
// Implements character-level discretization, KL divergence against English
// reference distribution, multi-scale entropy analysis, and segment-level
// thermal equilibrium computation.
// ========================================================================

export function thermosolve(content: string): InternalSignature {
  const lower = content.toLowerCase();
  const words = content.trim().split(/\s+/).filter(Boolean);
  const n = words.length;
  const totalChars = lower.length || 1;

  // === AGF Cache-First Lookup ===
  const contentHash = fnv1aHash(lower);
  const cached = teepLedger.get(contentHash);
  if (cached) {
    cached.hits++;
    cacheHits++;
    return { ...cached.signature, cache_hit: 1 };
  }
  cacheMisses++;

  // === Shannon Entropy (character frequency distribution) ===
  const charFreq = new Map<string, number>();
  for (const char of lower) {
    charFreq.set(char, (charFreq.get(char) || 0) + 1);
  }
  let S = 0;
  for (const count of charFreq.values()) {
    const p = count / totalChars;
    if (p > 0) S -= p * Math.log2(p);
  }

  // === Entropy Gradient dS (convergence measurement) ===
  // Split content into halves, measure entropy change
  // Negative dS = converging toward basin attractor
  let dS = 0;
  if (lower.length > 20) {
    const mid = Math.floor(lower.length / 2);
    const S1 = shannonEntropy(lower.slice(0, mid));
    const S2 = shannonEntropy(lower.slice(mid));
    dS = S2 - S1; // Negative means converging
  } else {
    dS = -0.01 * S * (1 + Math.log(n + 1));
  }

  // === Phase Coherence φ (unique word ratio) ===
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const phi = n > 0 ? uniqueWords.size / n : 0;

  // === Truth Integration I_truth (information density) ===
  // Measures ratio of meaningful, likely-English words to total
  // Penalizes: empty input, gibberish, pure filler
  const meaningfulWords = words.filter(
    (w) => w.length > 2 && !FILLER_WORDS.has(w.toLowerCase()) && isLikelyWord(w),
  );
  const uniqueMeaningful = new Set(meaningfulWords.map((w) => w.toLowerCase()));
  let I_truth = 0;
  if (n > 0) {
    const densityRatio = uniqueMeaningful.size / Math.max(n, 1);
    const lengthBonus = n > 2 ? 0.1 : 0; // Minimum content length
    I_truth = Math.min(1, densityRatio * 1.5 + lengthBonus);
  }

  // === Naturality (KL divergence against English reference) ===
  // Low divergence = natural English text, high = gibberish/encoded
  let naturality = 0.5; // default for very short content
  if (lower.length > 5) {
    let klDiv = 0;
    for (const [ch, count] of charFreq) {
      const p = count / totalChars;
      const q = ENGLISH_FREQ[ch] || 0.0005; // epsilon for unseen
      klDiv += p * Math.log2(p / q);
    }
    // Map KL divergence to 0-1 (lower div = higher naturality)
    naturality = Math.max(0, Math.min(1, 1 - klDiv / 6));
  }

  // === Complexity Energy ===
  // n × avgWordLength × (S + 1) — bounded by BNA at 100K
  const avgWordLen = n > 0 ? words.reduce((s, w) => s + w.length, 0) / n : 0;
  const energy = n * avgWordLen * (S + 1);

  // === Thermal Equilibrium β_T ===
  // Split into segments, measure entropy variance
  // β_T ≈ 1.0 means thermal equilibrium (stable signal)
  let beta_T = 1.0;
  if (lower.length > 50) {
    const segCount = 4;
    const segSize = Math.floor(lower.length / segCount);
    const segEntropies: number[] = [];
    for (let i = 0; i < segCount; i++) {
      segEntropies.push(shannonEntropy(lower.slice(i * segSize, (i + 1) * segSize)));
    }
    const meanS = segEntropies.reduce((a, b) => a + b, 0) / segCount;
    const variance = segEntropies.reduce((a, s) => a + (s - meanS) ** 2, 0) / segCount;
    // Low variance → β_T near 1, high variance → far from 1
    beta_T = 1.0 / (1 + variance * 3);
  }

  // === Multi-Scale Coherence ===
  // Combines word uniqueness with bigram diversity
  let psi_coherence = phi;
  if (n > 3) {
    const bigrams = new Set<string>();
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.add(`${words[i].toLowerCase()}_${words[i + 1].toLowerCase()}`);
    }
    const bigramRatio = bigrams.size / Math.max(words.length - 1, 1);
    psi_coherence = (phi * 0.6 + bigramRatio * 0.4);
  }

  // === Structural Error Count ===
  let error_count = 0;
  // Extremely long single tokens (>45 chars, likely encoded)
  for (const w of words) {
    if (w.length > 45) error_count += 3;
  }
  // High non-alphanumeric ratio (encoded/binary content)
  const nonAlpha = (lower.match(/[^a-z0-9\s]/g) || []).length;
  if (totalChars > 10 && nonAlpha / totalChars > 0.5) error_count += 5;
  // Excessive character repetition (aaa, !!!, etc.)
  const tripleRepeat = (lower.match(/(.)\1{2,}/g) || []).length;
  error_count += tripleRepeat * 2;

  // === Quality Factor Q ===
  // Energy per unit coherence — lower is better
  // Normalized by word count to prevent length bias
  const Q_quality = n > 0 && psi_coherence > 0
    ? (energy / (n * (psi_coherence * 5 + 1)))
    : energy;

  // === System Synergy ===
  // Weighted combination: all dimensions contributing to system health
  const synergy = (
    phi * 0.25 +
    naturality * 0.25 +
    I_truth * 0.25 +
    psi_coherence * 0.15 +
    (beta_T > 0.5 ? 0.1 : 0)
  );

  const signature: InternalSignature = {
    n,
    S: round4(S),
    dS: round4(dS),
    phi: round4(phi),
    I_truth: round4(I_truth),
    naturality: round4(naturality),
    energy: round4(energy),
    beta_T: round4(beta_T),
    psi_coherence: round4(psi_coherence),
    error_count: Math.round(error_count),
    Q_quality: round4(Q_quality),
    synergy: round4(synergy),
    cache_hit: 0,
  };

  // === Evolve PsiState (gradient descent: dψ/dt = -η∇S[ψ]) ===
  evolvePsiState(signature);

  return signature;
}

// ========================================================================
// CBF CHECK — 8 Control Barrier Functions (ALL must be SAFE)
// ========================================================================
// Based on: core/control_barrier_engine.py
// Each barrier computes a real value from the thermosolve signature.
// If ANY barrier is UNSAFE → output is BLOCKED.
// ========================================================================

export function cbfCheck(sig: InternalSignature): InternalBarrierResult {
  const results = {
    // BNR: Boundary Non-Regression — Truth integration ≥ 0.3
    // Catches: empty input, gibberish, pure filler, low-information content
    BNR: { safe: sig.I_truth >= 0.3, value: round3(sig.I_truth) },

    // BNN: Boundary Non-Nullification — Naturality ≥ 0.2
    // Catches: encoded content, binary data, non-English character distributions
    BNN: { safe: sig.naturality >= 0.2, value: round3(sig.naturality) },

    // BNA: Boundary Non-Amplification — Energy ≤ 100,000
    // Catches: extremely long/complex inputs that could overwhelm processing
    BNA: { safe: sig.energy <= 100000, value: round3(sig.energy) },

    // TSE: Thermodynamic State Evolution — |β_T - 1| < 0.5
    // Catches: content with wildly inconsistent entropy (unstable signal)
    TSE: { safe: Math.abs(sig.beta_T - 1) < 0.5, value: round3(sig.beta_T) },

    // PCD: Predictive Collision Detection — Coherence ≥ 0.1
    // Catches: fragmented, contradictory, or incoherent content
    PCD: { safe: sig.psi_coherence >= 0.1, value: round3(sig.psi_coherence) },

    // OGP: Objective Goal Preservation — Errors ≤ 100
    // Catches: structurally malformed content (encoded blobs, extreme repetition)
    OGP: { safe: sig.error_count <= 100, value: sig.error_count },

    // ECM: Energy Conservation Management — Quality ≤ 500
    // Catches: content where energy is not conserved (unstable quality ratio)
    ECM: { safe: sig.Q_quality <= 500, value: round3(sig.Q_quality) },

    // SPC: System Performance Consistency — Synergy ≥ 0.5
    // Catches: content that fails across multiple dimensions simultaneously
    SPC: { safe: sig.synergy >= 0.5, value: round3(sig.synergy) },
  };

  const allSafe = Object.values(results).every((r) => r.safe);
  return { ...results, allSafe };
}

// ========================================================================
// PSISTATE EVOLUTION — Gradient descent on entropy
// ========================================================================
// dψ/dt = g_F^{-1}(ψ) · [-η∇S[ψ]]
// Each enforcement request advances the state one step.
// ========================================================================

function evolvePsiState(sig: InternalSignature): void {
  const eta = 0.01; // Learning rate

  psiState.cycle++;
  psiState.time = Date.now();

  // Entropy gradient drives state evolution
  psiState.S += eta * sig.dS;
  psiState.delta_H_sem = sig.dS;
  psiState.S_CTS = (psiState.S_CTS * 0.95) + (sig.S * 0.05);

  // Update cognitive variables from signature
  psiState.psi_coherence = (psiState.psi_coherence * 0.9) + (sig.psi_coherence * 0.1);
  psiState.phi_phase = (psiState.phi_phase * 0.9) + (sig.phi * 0.1);
  psiState.I_truth = (psiState.I_truth * 0.9) + (sig.I_truth * 0.1);
  psiState.beta_T = (psiState.beta_T * 0.9) + (sig.beta_T * 0.1);

  // Manifold stability: improves with consistent enforcement passes
  psiState.kappa = Math.min(1, psiState.kappa + (sig.synergy > 0.5 ? 0.001 : -0.005));

  // Energy tracking
  psiState.E_meta = (psiState.E_meta * 0.95) + (sig.energy * 0.05);

  // Curvature from entropy gradient variance
  psiState.R_curv = Math.abs(sig.dS) * 10;

  // Flow parameter tracks convergence rate
  psiState.lambda_flow = sig.dS < 0 ? Math.min(1, psiState.lambda_flow + 0.01) : Math.max(0, psiState.lambda_flow - 0.02);

  // Noise estimation from error count
  psiState.sigma_noise = (psiState.sigma_noise * 0.9) + ((sig.error_count / 100) * 0.1);

  // Adaptation delta
  psiState.delta_S_adaptation = sig.dS;
}

// ========================================================================
// AGF PROTOCOL — Cache-First Lookup (PASS STATE, NOT WORDS)
// ========================================================================
// ON query Q:
//   1. hash(Q) → basin_index lookup → FULL HIT → serve cached content (NO LLM)
//   2. sig(Q) → basin proximity search → BASIN HIT → serve nearest basin (NO LLM)
//   3. MISS → JIT solve via LLM → commit content + signature → O(1) next time
// ========================================================================

export type AgfResult =
  | { type: "FULL_HIT"; content: string; teepId: string; signature: InternalSignature }
  | { type: "BASIN_HIT"; content: string; teepId: string; signature: InternalSignature; distance: number }
  | { type: "JIT_SOLVE" };

/**
 * Signature-space distance using DYNAMIC Fisher metric.
 * g_ij(t+Δt) = g_ij(t) + η * R(ψ) — the metric evolves with successful hits.
 * Dimensions where truth has been repeatedly confirmed get HEAVIER weights,
 * making those basins deeper and easier to match.
 *
 * This IS the Morphic Resonance from Phase 3 research.
 */
function signatureDistance(a: InternalSignature, b: InternalSignature): number {
  // Dynamic Fisher metric — weights evolve via morphic resonance
  const w = dynamicFisherWeights;

  let d2 = 0;
  d2 += w.S * (a.S - b.S) ** 2;
  d2 += w.phi * (a.phi - b.phi) ** 2;
  d2 += w.I_truth * (a.I_truth - b.I_truth) ** 2;
  d2 += w.naturality * (a.naturality - b.naturality) ** 2;
  d2 += w.beta_T * (a.beta_T - b.beta_T) ** 2;
  d2 += w.psi_coherence * (a.psi_coherence - b.psi_coherence) ** 2;
  d2 += w.synergy * (a.synergy - b.synergy) ** 2;

  return Math.sqrt(d2);
}

/**
 * Compute semantic mass of a TEEP: m_s = (R * ℏ_s) / Δφ
 * Based on L:\ research — Ricci curvature induced by the TEEP in the manifold.
 * Heavy TEEPs are "load-bearing truths" that resist eviction and attract queries.
 */
function computeSemanticMass(sig: InternalSignature, hits: number): number {
  // Ricci scalar approximation: coherence * truth density * hit reinforcement
  const ricci = sig.psi_coherence * sig.I_truth * (1 + Math.log(1 + hits));
  // Semantic Planck constant (ℏ_s) normalized by phase coherence
  const hbar_s = sig.synergy * 0.1;
  // Δφ = phase coherence (avoid division by zero)
  const deltaPhi = Math.max(sig.phi, 0.01);
  // m_s = (R * ℏ_s) / Δφ, clamped to [0, 1]
  return Math.min(1, (ricci * hbar_s) / deltaPhi);
}

/**
 * Morphic Resonance: Reinforce the Fisher metric when a TEEP gets hit.
 * "The habit of truth becomes the path of least resistance."
 *
 * When a basin is accessed, the metric dimensions that match well get
 * strengthened — making future similar queries converge faster.
 */
function reinforceMorphicField(matchedSig: InternalSignature): void {
  totalResonanceEvents++;

  // Determine which dimensions contributed most to this match
  // and strengthen those dimensions in the Fisher metric
  const dimensions: (keyof typeof dynamicFisherWeights)[] = [
    "S", "phi", "I_truth", "naturality", "beta_T", "psi_coherence", "synergy",
  ];

  for (const dim of dimensions) {
    const sigValue = matchedSig[dim] as number;
    // Dimensions with high absolute values in the matched TEEP
    // contributed more to the match — reinforce them
    const reinforcement = MORPHIC_LEARNING_RATE * Math.abs(sigValue) * 0.1;
    dynamicFisherWeights[dim] += reinforcement;
  }

  // Update morphic field strength (global resonance accumulator)
  morphicFieldStrength += matchedSig.synergy * 0.01;
}

// Basin proximity threshold — signatures closer than this are in the same basin
// As morphic field strengthens, the threshold can widen slightly (deeper basins)
function getBasinThreshold(): number {
  const BASE_THRESHOLD = 0.15;
  // Morphic resonance widens basins slightly — up to 2x at max resonance
  const morphicBonus = Math.min(0.15, morphicFieldStrength * 0.01);
  return BASE_THRESHOLD + morphicBonus;
}

/**
 * AGF Protocol: Look up input in TEEP cache BEFORE calling LLM.
 * Returns cached content on hit, or JIT_SOLVE signal on miss.
 *
 * FULL_HIT:  Exact input seen before → serve cached response directly
 * BASIN_HIT: Similar input in same basin → serve nearest solved basin
 * JIT_SOLVE: Total miss → caller must invoke LLM as JIT physics solver
 */
export function agfLookup(inputContent: string): AgfResult {
  const inputHash = fnv1aHash(inputContent.toLowerCase());

  // Step 1: Exact input hash lookup in basin index → O(1)
  const responseHash = basinIndex.get(inputHash);
  if (responseHash) {
    const cached = teepLedger.get(responseHash);
    if (cached && cached.cbfResult.allSafe) {
      cached.hits++;
      cacheHits++;
      agfFullHits++;
      agfApiCallsAvoided++;
      // v11.0-Q: Morphic Resonance — reinforce the Fisher metric on hit
      cached.resonanceStrength += MORPHIC_LEARNING_RATE;
      cached.lastResonance = Date.now();
      cached.semanticMass = computeSemanticMass(cached.signature, cached.hits);
      reinforceMorphicField(cached.signature);
      return {
        type: "FULL_HIT",
        content: cached.content,
        teepId: cached.id,
        signature: { ...cached.signature, cache_hit: 1 },
      };
    }
  }

  // Step 2: Basin proximity search via Dynamic Fisher Metric
  const inputSig = thermosolve(inputContent);
  const threshold = getBasinThreshold(); // Dynamic — widens with morphic resonance

  let bestMatch: CachedTeep | null = null;
  let bestDistance = Infinity;

  for (const teep of teepLedger.values()) {
    if (!teep.cbfResult.allSafe) continue;
    const d = signatureDistance(inputSig, teep.signature);
    // Semantic mass bonus: heavier TEEPs have a wider attraction radius
    const massAdjustedDistance = d / (1 + teep.semanticMass * 0.5);
    if (massAdjustedDistance < bestDistance) {
      bestDistance = massAdjustedDistance;
      bestMatch = teep;
    }
  }

  if (bestMatch && bestDistance < threshold) {
    bestMatch.hits++;
    cacheHits++;
    agfBasinHits++;
    agfApiCallsAvoided++;
    // v11.0-Q: Morphic Resonance — basin hit reinforces the metric
    bestMatch.resonanceStrength += MORPHIC_LEARNING_RATE * 0.5;
    bestMatch.lastResonance = Date.now();
    bestMatch.semanticMass = computeSemanticMass(bestMatch.signature, bestMatch.hits);
    reinforceMorphicField(bestMatch.signature);
    return {
      type: "BASIN_HIT",
      content: bestMatch.content,
      teepId: bestMatch.id,
      signature: { ...bestMatch.signature, cache_hit: 1 },
      distance: round4(bestDistance),
    };
  }

  // Step 3: Total miss — JIT solve required
  cacheMisses++;
  agfJitSolves++;
  return { type: "JIT_SOLVE" };
}

// ========================================================================
// TEEP ID + LEDGER COMMIT
// ========================================================================

export function generateTeepId(): string {
  teepCounter++;
  return `TEEP-${String(teepCounter).padStart(8, "0")}`;
}

/**
 * Commit a thermosolve result to the TEEP ledger for future O(1) lookup.
 * Stores CONTENT (not just signature) — this is what gets served on cache hits.
 * Also indexes by input hash for O(1) full-hit lookup.
 *
 * AGF Protocol Step 5: Cache for future O(1) retrieval.
 */
export function commitTeep(
  responseContent: string,
  signature: InternalSignature,
  allSafe: boolean,
  inputContent?: string,
): string {
  const id = generateTeepId();
  const responseHash = fnv1aHash(responseContent.toLowerCase());

  const initialMass = computeSemanticMass(signature, 0);

  teepLedger.set(responseHash, {
    id,
    signature,
    cbfResult: { allSafe },
    content_hash: responseHash,
    content: responseContent,  // Store actual content for AGF serving
    input_hash: inputContent ? fnv1aHash(inputContent.toLowerCase()) : undefined,
    created: Date.now(),
    hits: 0,
    // v11.0-Q: Initialize morphic resonance fields
    semanticMass: initialMass,
    resonanceStrength: 0,
    lastResonance: Date.now(),
  });

  // Index input → response for O(1) full-hit lookup
  if (inputContent) {
    const inputHash = fnv1aHash(inputContent.toLowerCase());
    basinIndex.set(inputHash, responseHash);

    // Keep basin index bounded
    if (basinIndex.size > 15000) {
      const oldest = basinIndex.keys().next().value;
      if (oldest) basinIndex.delete(oldest);
    }
  }

  // Keep ledger bounded (mass-aware eviction at 10K entries)
  // v11.0-Q: Heavy TEEPs resist eviction — evict lightest mass first
  if (teepLedger.size > 10000) {
    let lightestKey: string | null = null;
    let lightestMass = Infinity;
    for (const [key, teep] of teepLedger) {
      if (teep.semanticMass < lightestMass) {
        lightestMass = teep.semanticMass;
        lightestKey = key;
      }
    }
    if (lightestKey) teepLedger.delete(lightestKey);
  }

  return id;
}

// ========================================================================
// ENFORCEMENT METRICS — For admin dashboard
// ========================================================================

export function getEnforcementMetrics() {
  // Compute aggregate semantic mass stats
  let totalMass = 0;
  let heaviestMass = 0;
  let totalResonance = 0;
  for (const teep of teepLedger.values()) {
    totalMass += teep.semanticMass;
    if (teep.semanticMass > heaviestMass) heaviestMass = teep.semanticMass;
    totalResonance += teep.resonanceStrength;
  }

  return {
    psiState: { ...psiState },
    teepLedgerSize: teepLedger.size,
    basinIndexSize: basinIndex.size,
    cacheHits,
    cacheMisses,
    hitRate: cacheHits + cacheMisses > 0
      ? round4(cacheHits / (cacheHits + cacheMisses))
      : 0,
    // AGF Protocol stats
    agf: {
      fullHits: agfFullHits,
      basinHits: agfBasinHits,
      jitSolves: agfJitSolves,
      apiCallsAvoided: agfApiCallsAvoided,
      totalLookups: agfFullHits + agfBasinHits + agfJitSolves,
      hitRate: (agfFullHits + agfBasinHits + agfJitSolves) > 0
        ? round4((agfFullHits + agfBasinHits) / (agfFullHits + agfBasinHits + agfJitSolves))
        : 0,
    },
    // v11.0-Q Morphic Resonance stats
    morphic: {
      fieldStrength: round4(morphicFieldStrength),
      resonanceEvents: totalResonanceEvents,
      dynamicFisherWeights: { ...dynamicFisherWeights },
      basinThreshold: round4(getBasinThreshold()),
      totalSemanticMass: round4(totalMass),
      heaviestTeepMass: round4(heaviestMass),
      totalResonanceAccum: round4(totalResonance),
    },
  };
}

/**
 * Get recent TEEP entries for admin inspection.
 * Now includes content preview for admin visibility.
 */
export function getRecentTeeps(limit = 20): Array<{
  id: string;
  hash: string;
  created: number;
  hits: number;
  contentPreview: string;
  semanticMass: number;
  resonanceStrength: number;
  sig: { n: number; S: number; phi: number; I_truth: number };
}> {
  const entries = Array.from(teepLedger.values())
    .sort((a, b) => b.created - a.created)
    .slice(0, limit);

  return entries.map((e) => ({
    id: e.id,
    hash: e.content_hash,
    created: e.created,
    hits: e.hits,
    contentPreview: e.content.slice(0, 80) + (e.content.length > 80 ? "..." : ""),
    semanticMass: round4(e.semanticMass),
    resonanceStrength: round4(e.resonanceStrength),
    sig: {
      n: e.signature.n,
      S: e.signature.S,
      phi: e.signature.phi,
      I_truth: e.signature.I_truth,
    },
  }));
}
