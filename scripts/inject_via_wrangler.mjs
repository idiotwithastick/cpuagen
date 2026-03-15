#!/usr/bin/env node
/**
 * Generate SQL file from checkpoint, then execute via wrangler d1 execute.
 * This avoids needing CF_API_TOKEN — wrangler uses its own auth.
 */
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { execSync } from "child_process";

const D1_DB_NAME = "cpuagen-teep-cache"; // wrangler uses name, not ID

function sha256(s) { return createHash("sha256").update(s).digest("hex").slice(0, 16); }

function escapeSQL(s) {
  return s.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

async function main() {
  const dataDir = new URL("../data/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  const checkpoint = dataDir + "/solved_teeps_checkpoint_7504.json";
  console.log(`Reading ${checkpoint}...`);
  const teeps = JSON.parse(readFileSync(checkpoint, "utf8"));
  console.log(`Loaded ${teeps.length} solved TEEPs`);

  // Generate SQL in batches of 50
  const BATCH = 50;
  const sqlDir = dataDir + "/sql_batches";
  try { execSync(`mkdir -p "${sqlDir}"`); } catch {}

  let batchNum = 0;
  for (let i = 0; i < teeps.length; i += BATCH) {
    const batch = teeps.slice(i, i + BATCH);
    let sql = "";

    for (const t of batch) {
      const content = `Q: ${t.question}\nA: ${t.answer}`;
      const contentHash = t.outputHash || sha256(content);
      const inputHash = t.inputHash || sha256(t.question.toLowerCase().trim());
      const sigJson = JSON.stringify(t.signature || {});
      const now = new Date().toISOString();

      sql += `INSERT OR IGNORE INTO teeps (id, content_hash, input_hash, content, signature_json, cbf_all_safe, hits, semantic_mass, resonance_strength, role, created_at, last_resonance) VALUES ('${escapeSQL(t.id)}', '${escapeSQL(contentHash)}', '${escapeSQL(inputHash)}', '${escapeSQL(content)}', '${escapeSQL(sigJson)}', 1, 0, 1.0, 0.5, 'ASSISTANT', '${now}', '${now}');\n`;
      sql += `INSERT OR IGNORE INTO basin_index (input_hash, content_hash, teep_id, created_at) VALUES ('${escapeSQL(inputHash)}', '${escapeSQL(contentHash)}', '${escapeSQL(t.id)}', '${now}');\n`;
    }

    const batchFile = `${sqlDir}/batch_${String(batchNum).padStart(4, "0")}.sql`;
    writeFileSync(batchFile, sql);
    batchNum++;
  }

  console.log(`Generated ${batchNum} SQL batch files in ${sqlDir}/`);
  console.log(`Now executing via wrangler...`);

  let injected = 0, errors = 0;
  for (let b = 0; b < batchNum; b++) {
    const batchFile = `${sqlDir}/batch_${String(b).padStart(4, "0")}.sql`;
    try {
      execSync(`npx wrangler d1 execute cpuagen-teep-cache --remote --file="${batchFile}" --yes 2>&1`, {
        timeout: 30000,
        stdio: "pipe"
      });
      injected += Math.min(BATCH, teeps.length - b * BATCH);
      if (b % 10 === 0) process.stdout.write(`  ${injected}/${teeps.length}\r`);
    } catch (e) {
      errors++;
      if (errors <= 3) console.error(`  Batch ${b} error: ${e.message.slice(0, 100)}`);
    }
  }

  console.log(`\nInjection complete: ~${injected} inserted, ${errors} batch errors`);
}

main().catch(e => { console.error(e); process.exit(1); });
