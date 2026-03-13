#!/usr/bin/env node
/**
 * Inject solved TEEPs from checkpoint files into Cloudflare D1.
 *
 * Uses multi-row INSERT for speed (~50 rows per statement).
 * Handles both teeps and basin_index tables.
 *
 * Usage:
 *   CF_API_TOKEN=your-token node scripts/inject_solved_teeps.mjs
 *
 * The CF_API_TOKEN can be created at:
 *   https://dash.cloudflare.com/profile/api-tokens
 *   (needs D1 Edit permission for the cpuagen-teep-ledger database)
 */

import { readFileSync, readdirSync } from "fs";
import { createHash } from "crypto";

const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const CF_ACCOUNT_ID = "b621d14f660c227bfec605351679bb86";
const CF_API_TOKEN = process.env.CF_API_TOKEN;

if (!CF_API_TOKEN) {
  console.error("ERROR: Set CF_API_TOKEN environment variable");
  console.error("  Create one at: https://dash.cloudflare.com/profile/api-tokens");
  console.error("  Needs: D1 Edit permission");
  process.exit(1);
}

const D1_API = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

function sha256(s) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

async function d1Query(sql, params = []) {
  const res = await fetch(D1_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors));
  return data.result;
}

async function main() {
  // Find largest checkpoint file
  const dataDir = new URL("../data/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  const files = readdirSync(dataDir)
    .filter((f) => f.startsWith("solved_teeps_checkpoint_"))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] || "0");
      const nb = parseInt(b.match(/(\d+)/)?.[1] || "0");
      return nb - na;
    });

  if (!files.length) {
    console.error("No checkpoint files found in data/");
    process.exit(1);
  }

  const checkpointFile = dataDir + "/" + files[0];
  console.log(`Reading ${checkpointFile}...`);
  const teeps = JSON.parse(readFileSync(checkpointFile, "utf8"));
  console.log(`Loaded ${teeps.length} solved TEEPs\n`);

  // Check existing count
  const [preCount] = await d1Query("SELECT COUNT(*) as c FROM teeps");
  const preTEEPs = preCount[0]?.results?.[0]?.c || 0;
  console.log(`D1 before injection: ${preTEEPs} TEEPs\n`);

  const BATCH = 25; // rows per multi-row INSERT
  const CONCURRENCY = 3; // parallel API calls
  const now = new Date().toISOString();
  let injected = 0;
  let errors = 0;
  const startTime = Date.now();

  // Phase 1: Insert into teeps table
  console.log("Phase 1: Injecting into teeps table...");
  for (let i = 0; i < teeps.length; i += BATCH * CONCURRENCY) {
    const batchPromises = [];

    for (let c = 0; c < CONCURRENCY; c++) {
      const start = i + c * BATCH;
      if (start >= teeps.length) break;
      const batch = teeps.slice(start, start + BATCH);

      const rows = batch.map((t) => {
        const content = esc(
          ("Q: " + t.question + "\nA: " + t.answer).slice(0, 2000)
        );
        const sig = esc(JSON.stringify(t.signature));
        const contentHash = t.outputHash || sha256(content);
        const inputHash =
          t.inputHash || sha256(t.question.toLowerCase().trim());
        return `('${esc(t.id)}','${contentHash}','${inputHash}','${content}','${sig}',1,0,1.0,0.5,'ASSISTANT','${now}','${now}')`;
      });

      const sql =
        "INSERT OR IGNORE INTO teeps (id, content_hash, input_hash, content, signature_json, cbf_all_safe, hits, semantic_mass, resonance_strength, role, created_at, last_resonance) VALUES " +
        rows.join(",") +
        ";";

      batchPromises.push(
        d1Query(sql)
          .then(() => batch.length)
          .catch((e) => {
            errors++;
            if (errors <= 5)
              console.error(`  Error at ${start}: ${e.message.slice(0, 100)}`);
            return 0;
          })
      );
    }

    const results = await Promise.all(batchPromises);
    injected += results.reduce((a, b) => a + b, 0);

    if (injected % 500 < BATCH * CONCURRENCY || i + BATCH * CONCURRENCY >= teeps.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (injected / (Date.now() - startTime) * 1000).toFixed(1);
      process.stdout.write(
        `\r  TEEPs: ${injected}/${teeps.length} (${rate}/sec, ${elapsed}s elapsed, ${errors} errors)`
      );
    }
  }
  console.log("");

  // Phase 2: Insert into basin_index table
  console.log("\nPhase 2: Injecting into basin_index table...");
  let basinInserted = 0;
  for (let i = 0; i < teeps.length; i += BATCH * CONCURRENCY) {
    const batchPromises = [];

    for (let c = 0; c < CONCURRENCY; c++) {
      const start = i + c * BATCH;
      if (start >= teeps.length) break;
      const batch = teeps.slice(start, start + BATCH);

      const rows = batch.map((t) => {
        const inputHash =
          t.inputHash || sha256(t.question.toLowerCase().trim());
        const contentHash =
          t.outputHash || sha256(("Q: " + t.question + "\nA: " + t.answer));
        return `('${inputHash}','${contentHash}','${esc(t.id)}','${now}')`;
      });

      const sql =
        "INSERT OR IGNORE INTO basin_index (input_hash, content_hash, teep_id, created_at) VALUES " +
        rows.join(",") +
        ";";

      batchPromises.push(
        d1Query(sql)
          .then(() => batch.length)
          .catch(() => 0)
      );
    }

    const results = await Promise.all(batchPromises);
    basinInserted += results.reduce((a, b) => a + b, 0);

    if (basinInserted % 500 < BATCH * CONCURRENCY || i + BATCH * CONCURRENCY >= teeps.length) {
      process.stdout.write(
        `\r  Basins: ${basinInserted}/${teeps.length}`
      );
    }
  }
  console.log("");

  // Final report
  const [postTeepCount] = await d1Query("SELECT COUNT(*) as c FROM teeps");
  const [postBasinCount] = await d1Query(
    "SELECT COUNT(*) as c FROM basin_index"
  );
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== INJECTION COMPLETE (${elapsed}s) ===`);
  console.log(
    `D1 totals: ${postTeepCount[0]?.results?.[0]?.c || "?"} TEEPs, ${postBasinCount[0]?.results?.[0]?.c || "?"} basins`
  );
  console.log(
    `New: ~${injected} TEEPs + ~${basinInserted} basins, ${errors} errors`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
