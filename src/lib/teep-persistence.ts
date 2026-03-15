/**
 * TEEP Persistence Layer — Cloudflare D1 Backend
 *
 * Bridges the in-memory enforcement engine with persistent D1 storage.
 * All writes are async/non-blocking so they don't slow down request handling.
 * Reads happen on cold start to seed the in-memory cache.
 *
 * D1 Database: cpuagen-teep-ledger
 * Tables: teeps, basin_index, teep_stats
 */

const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "b621d14f660c227bfec605351679bb86";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";

const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

interface D1QueryResult {
  results: Record<string, unknown>[];
  success: boolean;
  meta: { changes: number; rows_read: number };
}

async function d1Query(sql: string, params?: string[]): Promise<D1QueryResult[]> {
  if (!CF_API_TOKEN) {
    // Silent no-op if not configured — local dev won't have this
    return [];
  }

  try {
    const res = await fetch(`${D1_API_BASE}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params: params || [] }),
    });

    if (!res.ok) {
      console.error(`[TEEP-D1] Query failed: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json() as { result: D1QueryResult[] };
    return data.result || [];
  } catch (err) {
    console.error("[TEEP-D1] Query error:", err);
    return [];
  }
}

/* ─── TEEP Structure (matches enforcement.ts CachedTeep) ─── */

export interface PersistedTeep {
  id: string;
  content_hash: string;
  input_hash?: string;
  content: string;
  signature: Record<string, number>;
  cbf_all_safe: boolean;
  hits: number;
  semantic_mass: number;
  resonance_strength: number;
  boundary?: number[];
  parent_id?: string;
  role?: string;
  turn?: number;
  created_at: number;
  last_resonance: number;
}

/* ─── WRITE: Persist a TEEP after commitTeep ─── */

export async function persistTeep(teep: PersistedTeep): Promise<void> {
  await ensureTeepTables();
  const sql = `
    INSERT OR REPLACE INTO teeps (
      id, content_hash, input_hash, content, signature_json,
      cbf_all_safe, hits, semantic_mass, resonance_strength,
      boundary_json, parent_id, role, turn, created_at, last_resonance, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    teep.id,
    teep.content_hash,
    teep.input_hash || "",
    teep.content,
    JSON.stringify(teep.signature),
    teep.cbf_all_safe ? "1" : "0",
    String(teep.hits),
    String(teep.semantic_mass),
    String(teep.resonance_strength),
    teep.boundary ? JSON.stringify(teep.boundary) : "",
    teep.parent_id || "",
    teep.role || "",
    String(teep.turn || 0),
    String(teep.created_at),
    String(teep.last_resonance),
    String(Date.now()),
  ];

  await d1Query(sql, params);
}

/* ─── WRITE: Persist basin index entry ─── */

export async function persistBasinIndex(inputHash: string, contentHash: string, teepId: string): Promise<void> {
  await ensureTeepTables();
  const sql = `INSERT OR REPLACE INTO basin_index (input_hash, content_hash, teep_id, created_at) VALUES (?, ?, ?, ?)`;
  await d1Query(sql, [inputHash, contentHash, teepId, String(Date.now())]);
}

/* ─── WRITE: Update hit count ─── */

export async function persistHitUpdate(contentHash: string, hits: number, resonanceStrength: number, semanticMass: number): Promise<void> {
  await ensureTeepTables();
  const sql = `UPDATE teeps SET hits = ?, resonance_strength = ?, semantic_mass = ?, last_resonance = ?, updated_at = ? WHERE content_hash = ?`;
  const now = String(Date.now());
  await d1Query(sql, [String(hits), String(resonanceStrength), String(semanticMass), now, now, contentHash]);
}

/* ─── WRITE: Increment global stats ─── */

export async function persistStatsIncrement(type: "commit" | "hit" | "query" | "api_avoided"): Promise<void> {
  await ensureTeepTables();
  const colMap = {
    commit: "total_commits",
    hit: "total_hits",
    query: "total_queries",
    api_avoided: "api_calls_avoided",
  };
  const col = colMap[type];
  const sql = `INSERT INTO teep_stats (id, ${col}, last_updated) VALUES (1, 1, ?)
    ON CONFLICT(id) DO UPDATE SET ${col} = ${col} + 1, last_updated = ?`;
  const now = String(Date.now());
  await d1Query(sql, [now, now]);
}

/* ─── READ: Load hot TEEPs for cold start cache seeding ─── */

export async function loadHotTeeps(limit: number = 500): Promise<PersistedTeep[]> {
  await ensureTeepTables();
  const sql = `
    SELECT id, content_hash, input_hash, content, signature_json,
           cbf_all_safe, hits, semantic_mass, resonance_strength,
           boundary_json, parent_id, role, turn, created_at, last_resonance
    FROM teeps
    WHERE cbf_all_safe = 1
    ORDER BY hits DESC, last_resonance DESC
    LIMIT ?
  `;

  const results = await d1Query(sql, [String(limit)]);
  if (!results.length || !results[0].results) return [];

  return results[0].results.map((row) => ({
    id: row.id as string,
    content_hash: row.content_hash as string,
    input_hash: (row.input_hash as string) || undefined,
    content: row.content as string,
    signature: JSON.parse(row.signature_json as string),
    cbf_all_safe: (row.cbf_all_safe as number) === 1,
    hits: row.hits as number,
    semantic_mass: row.semantic_mass as number,
    resonance_strength: row.resonance_strength as number,
    boundary: row.boundary_json ? JSON.parse(row.boundary_json as string) : undefined,
    parent_id: (row.parent_id as string) || undefined,
    role: (row.role as string) || undefined,
    turn: (row.turn as number) || undefined,
    created_at: row.created_at as number,
    last_resonance: row.last_resonance as number,
  }));
}

/* ─── READ: Load basin index for exact-match lookups ─── */

export async function loadBasinIndex(limit: number = 2000): Promise<{ inputHash: string; contentHash: string; teepId: string }[]> {
  await ensureTeepTables();
  const sql = `SELECT input_hash, content_hash, teep_id FROM basin_index ORDER BY created_at DESC LIMIT ?`;
  const results = await d1Query(sql, [String(limit)]);
  if (!results.length || !results[0].results) return [];

  return results[0].results.map((row) => ({
    inputHash: row.input_hash as string,
    contentHash: row.content_hash as string,
    teepId: row.teep_id as string,
  }));
}

/* ─── READ: Exact hash lookup (for when in-memory misses but D1 has it) ─── */

export async function lookupByInputHash(inputHash: string): Promise<PersistedTeep | null> {
  const sql = `
    SELECT t.id, t.content_hash, t.input_hash, t.content, t.signature_json,
           t.cbf_all_safe, t.hits, t.semantic_mass, t.resonance_strength,
           t.boundary_json, t.parent_id, t.role, t.turn, t.created_at, t.last_resonance
    FROM basin_index b
    JOIN teeps t ON t.content_hash = b.content_hash
    WHERE b.input_hash = ? AND t.cbf_all_safe = 1
    LIMIT 1
  `;

  const results = await d1Query(sql, [inputHash]);
  if (!results.length || !results[0].results?.length) return null;

  const row = results[0].results[0];
  return {
    id: row.id as string,
    content_hash: row.content_hash as string,
    input_hash: (row.input_hash as string) || undefined,
    content: row.content as string,
    signature: JSON.parse(row.signature_json as string),
    cbf_all_safe: true,
    hits: row.hits as number,
    semantic_mass: row.semantic_mass as number,
    resonance_strength: row.resonance_strength as number,
    boundary: row.boundary_json ? JSON.parse(row.boundary_json as string) : undefined,
    parent_id: (row.parent_id as string) || undefined,
    role: (row.role as string) || undefined,
    turn: (row.turn as number) || undefined,
    created_at: row.created_at as number,
    last_resonance: row.last_resonance as number,
  };
}

/* ─── READ: Get global stats ─── */

export async function getPersistedStats(): Promise<{
  totalCommits: number;
  totalHits: number;
  totalQueries: number;
  apiCallsAvoided: number;
} | null> {
  const results = await d1Query("SELECT * FROM teep_stats WHERE id = 1");
  if (!results.length || !results[0].results?.length) return null;
  const row = results[0].results[0];
  return {
    totalCommits: (row.total_commits as number) || 0,
    totalHits: (row.total_hits as number) || 0,
    totalQueries: (row.total_queries as number) || 0,
    apiCallsAvoided: (row.api_calls_avoided as number) || 0,
  };
}

/* ─── READ: Get total TEEP count ─── */

export async function getTeepCount(): Promise<number> {
  const results = await d1Query("SELECT COUNT(*) as cnt FROM teeps WHERE cbf_all_safe = 1");
  if (!results.length || !results[0].results?.length) return 0;
  return (results[0].results[0].cnt as number) || 0;
}

/* ─── TABLE INITIALIZATION (idempotent, runs once per cold start) ─── */

let tablesEnsured = false;
let tablesEnsurePromise: Promise<boolean> | null = null;

export async function ensureTeepTables(): Promise<boolean> {
  if (tablesEnsured) return true;
  if (!CF_API_TOKEN) return false;
  if (tablesEnsurePromise) return tablesEnsurePromise;

  tablesEnsurePromise = (async () => {
    try {
      const sqls = [
        `CREATE TABLE IF NOT EXISTS teeps (
          id TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          input_hash TEXT DEFAULT '',
          content TEXT NOT NULL,
          signature_json TEXT NOT NULL,
          cbf_all_safe INTEGER NOT NULL DEFAULT 1,
          hits INTEGER NOT NULL DEFAULT 0,
          semantic_mass REAL NOT NULL DEFAULT 1.0,
          resonance_strength REAL NOT NULL DEFAULT 0.0,
          boundary_json TEXT DEFAULT '',
          parent_id TEXT DEFAULT '',
          role TEXT DEFAULT '',
          turn INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL,
          last_resonance INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_teeps_content_hash ON teeps(content_hash)`,
        `CREATE INDEX IF NOT EXISTS idx_teeps_hits ON teeps(hits DESC, last_resonance DESC)`,
        `CREATE TABLE IF NOT EXISTS basin_index (
          input_hash TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          teep_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_basin_content ON basin_index(content_hash)`,
        `CREATE TABLE IF NOT EXISTS teep_stats (
          id INTEGER PRIMARY KEY DEFAULT 1,
          total_commits INTEGER NOT NULL DEFAULT 0,
          total_hits INTEGER NOT NULL DEFAULT 0,
          total_queries INTEGER NOT NULL DEFAULT 0,
          api_calls_avoided INTEGER NOT NULL DEFAULT 0,
          last_updated INTEGER NOT NULL DEFAULT 0
        )`,
      ];
      for (const sql of sqls) {
        await d1Query(sql);
      }
      tablesEnsured = true;
      console.log("[TEEP-D1] Tables ensured (CREATE IF NOT EXISTS)");
      return true;
    } catch (err) {
      console.error("[TEEP-D1] Table creation failed:", err);
      tablesEnsurePromise = null;
      return false;
    }
  })();

  return tablesEnsurePromise;
}

/* ─── DIAGNOSTIC: Check if D1 is configured and reachable ─── */

export function isD1Configured(): boolean {
  return !!CF_API_TOKEN;
}

export async function d1HealthCheck(): Promise<{ ok: boolean; teepCount: number; message: string }> {
  if (!CF_API_TOKEN) {
    return { ok: false, teepCount: 0, message: "CF_API_TOKEN not set" };
  }
  try {
    const count = await getTeepCount();
    return { ok: true, teepCount: count, message: `D1 connected — ${count} TEEPs persisted` };
  } catch (err) {
    return { ok: false, teepCount: 0, message: `D1 error: ${err}` };
  }
}
