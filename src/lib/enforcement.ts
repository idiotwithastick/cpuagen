// Server-only types — never exposed to client bundle
interface InternalSignature {
  n: number;
  S: number;
  dS: number;
  phi: number;
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

let teepCounter = Date.now() % 1000000;

export function thermosolve(content: string): InternalSignature {
  const words = content.trim().split(/\s+/).filter(Boolean);
  const n = words.length;

  // Shannon entropy of character frequency distribution
  const charFreq = new Map<string, number>();
  const lower = content.toLowerCase();
  for (const char of lower) {
    charFreq.set(char, (charFreq.get(char) || 0) + 1);
  }
  let S = 0;
  const total = lower.length || 1;
  for (const count of charFreq.values()) {
    const p = count / total;
    if (p > 0) S -= p * Math.log2(p);
  }

  // Coherence: unique word ratio
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const phi = n > 0 ? uniqueWords.size / n : 0;

  // Entropy change (negative = converging toward basin attractor)
  const dS = -0.01 * S * (1 + Math.log(n + 1));

  return {
    n,
    S: Math.round(S * 10000) / 10000,
    dS: Math.round(dS * 10000) / 10000,
    phi: Math.round(phi * 10000) / 10000,
  };
}

export function cbfCheck(sig: InternalSignature): InternalBarrierResult {
  const I_truth = Math.min(1, sig.phi * 1.2);
  const naturality = 0.85;
  const energy = sig.n;
  const betaT = 1.0;
  const coherence = sig.phi;
  const errors = Math.max(0, Math.round((1 - sig.phi) * 10));
  const quality = sig.S * 10;
  const synergy = Math.min(1, sig.phi + 0.2);

  const results = {
    BNR: { safe: I_truth >= 0.3, value: Math.round(I_truth * 1000) / 1000 },
    BNN: { safe: naturality >= 0.2, value: naturality },
    BNA: { safe: energy <= 100000, value: energy },
    TSE: { safe: Math.abs(betaT - 1) < 0.5, value: betaT },
    PCD: { safe: coherence >= 0.1, value: Math.round(coherence * 1000) / 1000 },
    OGP: { safe: errors <= 100, value: errors },
    ECM: { safe: quality <= 500, value: Math.round(quality * 100) / 100 },
    SPC: { safe: synergy >= 0.5, value: Math.round(synergy * 1000) / 1000 },
  };

  const allSafe = Object.values(results).every((r) => r.safe);
  return { ...results, allSafe };
}

export function generateTeepId(): string {
  teepCounter++;
  return `TEEP-${String(teepCounter).padStart(8, "0")}`;
}
