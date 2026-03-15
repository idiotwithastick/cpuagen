#!/usr/bin/env node
/**
 * D1 Bulk Insert Script
 * Inserts pre-solved TEEPs from checkpoint file into Cloudflare D1
 */

const fs = require("fs");

const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const CF_ACCOUNT_ID = "b621d14f660c227bfec605351679bb86";
const D1_DATABASE_ID = "66c4ee55-8fbe-45d5-9a98-e88328aaf595";
const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

const CHECKPOINT_FILE = "L:/SSD-RCI_9_Unifying/cpuagen-live/data/solved_teeps_checkpoint_7504.json";
const BATCH_SIZE = 25; // rows per INSERT
const CONCURRENCY = 5; // parallel requests
const NOW = new Date().toISOString();

function esc(s) {
  return s.replace(/'/g, "''");
}

async function d1Query(sql) {
  const res = await fetch(`${D1_API_BASE}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed: ${res.status} ${text.substring(0, 200)}`);
  }

  return await res.json();
}

async function insertBatch(entries, batchNum) {
  // Build teeps INSERT
  const teepVals = entries
    .map((e) => {
      const content = esc("Q: " + e.question + "\nA: " + e.answer);
      const sigJson = esc(JSON.stringify(e.signature));
      return `('${esc(e.id)}','${e.outputHash}','${e.inputHash}','${content}','${sigJson}',1,0,1.0,0.5,'ASSISTANT','${NOW}','${NOW}')`;
    })
    .join(",");

  const teepSQL = `INSERT OR IGNORE INTO teeps (id,content_hash,input_hash,content,signature_json,cbf_all_safe,hits,semantic_mass,resonance_strength,role,created_at,last_resonance) VALUES ${teepVals}`;

  // Build basin_index INSERT
  const basinVals = entries
    .map(
      (e) =>
        `('${e.inputHash}','${e.outputHash}','${esc(e.id)}','${NOW}')`
    )
    .join(",");

  const basinSQL = `INSERT OR IGNORE INTO basin_index (input_hash,content_hash,teep_id,created_at) VALUES ${basinVals}`;

  // Execute both
  const combined = teepSQL + "; " + basinSQL;
  const result = await d1Query(combined);

  const changes =
    result.result?.reduce((sum, r) => sum + (r.meta?.changes || 0), 0) || 0;
  return changes;
}

async function main() {
  console.log("Loading checkpoint file...");
  const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
  console.log(`Loaded ${data.length} entries`);

  // Get current counts
  const before = await d1Query("SELECT COUNT(*) as cnt FROM teeps");
  const beforeBasin = await d1Query(
    "SELECT COUNT(*) as cnt FROM basin_index"
  );
  console.log(
    `Before: teeps=${before.result[0].results[0].cnt}, basin_index=${beforeBasin.result[0].results[0].cnt}`
  );

  // Create batches
  const batches = [];
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    batches.push(data.slice(i, i + BATCH_SIZE));
  }
  console.log(`Created ${batches.length} batches of ${BATCH_SIZE}`);

  let completed = 0;
  let totalChanges = 0;
  let errors = 0;

  // Process batches with concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY);
    const promises = chunk.map((batch, j) =>
      insertBatch(batch, i + j).catch((err) => {
        console.error(`  Batch ${i + j} error: ${err.message}`);
        errors++;
        return 0;
      })
    );

    const results = await Promise.all(promises);
    completed += chunk.length;
    totalChanges += results.reduce((s, r) => s + r, 0);

    if (completed % 50 === 0 || completed === batches.length) {
      const pct = ((completed / batches.length) * 100).toFixed(1);
      console.log(
        `  Progress: ${completed}/${batches.length} batches (${pct}%) | ${completed * BATCH_SIZE} rows | ${totalChanges} changes | ${errors} errors`
      );
    }
  }

  // Get final counts
  const after = await d1Query("SELECT COUNT(*) as cnt FROM teeps");
  const afterBasin = await d1Query(
    "SELECT COUNT(*) as cnt FROM basin_index"
  );
  console.log(`\nAfter: teeps=${after.result[0].results[0].cnt}, basin_index=${afterBasin.result[0].results[0].cnt}`);
  console.log(
    `New TEEPs: ${after.result[0].results[0].cnt - before.result[0].results[0].cnt}`
  );
  console.log(
    `New basins: ${afterBasin.result[0].results[0].cnt - beforeBasin.result[0].results[0].cnt}`
  );
  console.log(`Total errors: ${errors}`);
}

main().catch(console.error);
