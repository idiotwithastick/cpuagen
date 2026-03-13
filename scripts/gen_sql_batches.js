const fs = require('fs');
const d = fs.readFileSync('data/solved_teeps_checkpoint_7504.json','utf8');
const arr = JSON.parse(d);
const now = new Date().toISOString();
const BATCH = 50;

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const teepBatches = [];
const basinBatches = [];

for (let i = 0; i < arr.length; i += BATCH) {
  const batch = arr.slice(i, i + BATCH);

  const tRows = batch.map(t => {
    const content = esc(("Q: " + t.question + "\nA: " + t.answer).slice(0, 2000));
    const sig = esc(JSON.stringify(t.signature));
    const id = esc(t.id);
    return `('${id}','${t.outputHash}','${t.inputHash}','${content}','${sig}',1,0,1.0,0.5,'ASSISTANT','${now}','${now}')`;
  });
  teepBatches.push("INSERT OR IGNORE INTO teeps (id, content_hash, input_hash, content, signature_json, cbf_all_safe, hits, semantic_mass, resonance_strength, role, created_at, last_resonance) VALUES " + tRows.join(",") + ";");

  const bRows = batch.map(t => {
    return `('${t.inputHash}','${t.outputHash}','${esc(t.id)}','${now}')`;
  });
  basinBatches.push("INSERT OR IGNORE INTO basin_index (input_hash, content_hash, teep_id, created_at) VALUES " + bRows.join(",") + ";");
}

fs.writeFileSync('data/teep_sql_batches.json', JSON.stringify(teepBatches));
fs.writeFileSync('data/basin_sql_batches.json', JSON.stringify(basinBatches));
console.log("Generated " + teepBatches.length + " teep batches + " + basinBatches.length + " basin batches");
console.log("Teep batch 0 length: " + teepBatches[0].length);
console.log("Basin batch 0 length: " + basinBatches[0].length);
