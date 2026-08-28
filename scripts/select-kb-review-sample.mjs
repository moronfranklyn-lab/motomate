import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [manifestPath, batchId, seed, outputPath] = process.argv.slice(2);
if (!manifestPath || !batchId || !seed || !outputPath) process.exit(2);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const population = [...new Set(manifest.review_population_model_ids || [])].sort();
if (population.length === 0) process.exit(2);

const ranked = population.map((modelId) => ({
  model_id: modelId,
  rank: crypto.createHash("sha256").update(`${seed}:${modelId}`).digest("hex"),
})).sort((a, b) => a.rank.localeCompare(b.rank));
const sampleSize = Math.max(1, Math.ceil(population.length * 0.1));
const output = {
  batch_id: batchId,
  seed,
  sampled_at: new Date().toISOString(),
  population_size: population.length,
  sample_rate: 0.1,
  sample_size: sampleSize,
  sample_model_ids: ranked.slice(0, sampleSize).map((item) => item.model_id),
  method: "sha256(seed:model_id), ascending, first ceil(N*0.1)",
};

const resolvedOutputPath = path.resolve(outputPath);
fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
fs.writeFileSync(resolvedOutputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ output_path: resolvedOutputPath, population_size: population.length, sample_size: sampleSize, sample_model_ids: output.sample_model_ids }));
