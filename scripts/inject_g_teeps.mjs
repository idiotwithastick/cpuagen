/**
 * Inject content TEEPs from G: drive into CPUAGEN D1
 * Sources: full_seed.json (50) + thermodynamics_seed.json (10)
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";

const CF_API_TOKEN = process.env.CF_API_TOKEN || "0PJUfXHP3UFJVQ7mqAZNM9vF1HegwmrH9pwnzX2Z";
const CF_ACCOUNT_ID = "b621d14f660c227bfec605351679bb86";
const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const D1_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

function fnv1aHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

async function d1Query(sql, params) {
  const res = await fetch(D1_API, {
    method: "POST",
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params: params || [] }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`D1 ${res.status}: ${txt.slice(0, 200)}`);
  }
  return (await res.json()).result || [];
}

async function injectTeep(teep) {
  const contentHash = fnv1aHash(teep.response.toLowerCase());
  const inputHash = fnv1aHash(teep.query.toLowerCase());
  const sig = teep.signature || { n: 0, S: 0, dS: 0, phi: 0 };
  const now = String(Date.now());

  // Insert TEEP
  await d1Query(
    `INSERT OR IGNORE INTO teeps (id, content_hash, input_hash, content, signature_json, cbf_all_safe, hits, semantic_mass, resonance_strength, boundary_json, parent_id, role, turn, created_at, last_resonance, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 0, 0, 0, '', '', '', 0, ?, ?, ?)`,
    [teep.teep_id, contentHash, inputHash, teep.response, JSON.stringify(sig), now, now, now]
  );

  // Insert basin index
  await d1Query(
    `INSERT OR IGNORE INTO basin_index (input_hash, content_hash, teep_id, created_at)
     VALUES (?, ?, ?, ?)`,
    [inputHash, contentHash, teep.teep_id, now]
  );

  return { id: teep.teep_id, query: teep.query.slice(0, 50) };
}

async function main() {
  // Load both seed files
  const fullSeed = JSON.parse(readFileSync("G:/SSD-RCI_9_Unifying/data/teep_content/full_seed.json", "utf8"));
  const thermoSeed = JSON.parse(readFileSync("G:/SSD-RCI_9_Unifying/data/teep_content/thermodynamics_seed.json", "utf8"));

  const allTeeps = [...fullSeed.teeps, ...thermoSeed.teeps];
  console.log(`Injecting ${allTeeps.length} content TEEPs from G: drive...`);

  let injected = 0;
  let skipped = 0;
  for (const teep of allTeeps) {
    try {
      const result = await injectTeep(teep);
      injected++;
      console.log(`  [${injected}/${allTeeps.length}] ${result.id}: ${result.query}`);
    } catch (err) {
      // INSERT OR IGNORE means duplicates are silently skipped at DB level
      skipped++;
      console.log(`  SKIP: ${teep.query.slice(0, 50)} — ${err.message.slice(0, 100)}`);
    }
  }

  // Update stats
  await d1Query(
    `INSERT INTO teep_stats (id, total_commits, last_updated) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET total_commits = total_commits + ?, last_updated = ?`,
    [String(injected), String(Date.now()), String(injected), String(Date.now())]
  );

  console.log(`\nDone: ${injected} injected, ${skipped} skipped`);

  // Verify
  const r = await d1Query("SELECT COUNT(*) as cnt FROM teeps");
  const b = await d1Query("SELECT COUNT(*) as cnt FROM basin_index");
  console.log(`D1 totals: ${r[0].results[0].cnt} TEEPs, ${b[0].results[0].cnt} basins`);
}

main().catch(console.error);
