import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const knowledgeBase = require("../knowledge_base_outputs/eligible_pool/first_batch_v1.json");
const semanticEnrichment = require("../knowledge_base_outputs/semantic_enrichment/first_batch_semantic_v0.1.json");
const { shortlistModels } = require("../rules-engine.js");

const productionResult = shortlistModels(knowledgeBase, { budget_wan: 3, vehicle_type: "踏板" });
assert.equal(productionResult.status, "no_eligible_candidate");
assert.equal(productionResult.recommendation_allowed, false);
assert.equal(productionResult.candidate_count, 0);

const previewResult = shortlistModels(
  knowledgeBase,
  { budget_wan: 2, vehicle_type: "踏板" },
  { allowUnapprovedPreview: true },
);
assert.equal(previewResult.status, "development_preview");
assert.equal(previewResult.recommendation_allowed, false);
assert.equal(previewResult.candidate_count, 3);
assert.ok(previewResult.candidates.every((candidate) => candidate.vehicle_type === "踏板"));
assert.ok(previewResult.candidates.every((candidate) => candidate.budget_guard_price_cny <= 20000));
assert.equal(previewResult.candidates[0].evidence.price.official_public_price_cny, 13780);
assert.equal(previewResult.candidates[0].evidence.field_statuses.seat_height_mm, "official_verified");
assert.equal(previewResult.candidates[0].evidence.recommendation_approved, false);
assert.ok(previewResult.candidates[0].evidence.sources.some((source) => source.label.startsWith("品牌官方来源")));

const cruiserPreview = shortlistModels(
  knowledgeBase,
  { budget_cny: 23000, vehicle_type: "巡航" },
  { allowUnapprovedPreview: true },
);
assert.equal(cruiserPreview.candidate_count, 1);
assert.equal(cruiserPreview.candidates[0].model_name, "450CL-C");
assert.equal(cruiserPreview.candidates[0].trim_name, "标准版");

const overBudget = shortlistModels(
  knowledgeBase,
  { budget_cny: 13000 },
  { allowUnapprovedPreview: true },
);
assert.equal(overBudget.candidate_count, 0);

const semanticRanking = shortlistModels(
  knowledgeBase,
  { budget_wan: 3, usage: "commute", rider_experience: "beginner" },
  { allowUnapprovedPreview: true, semanticEnrichment },
);
assert.equal(semanticRanking.semantic_score_user_visible, false);
assert.equal(semanticRanking.semantic_policy, "v0.1_low_weight_internal_only");
assert.equal(semanticRanking.ranking_status, "partial_semantic_v0.1");
assert.deepEqual(semanticRanking.missing_ranking_fields, [
  "maintenance_convenience",
  "verified_subjective_experience",
]);
assert.equal(semanticRanking.candidates[0].model_name, "UHR150");
assert.ok(semanticRanking.candidates[0].internal_semantic_signal > 0);

const pcx = semanticRanking.candidates.find((candidate) => candidate.model_name === "PCX160");
assert.ok(pcx);
assert.equal(pcx.reason_codes.includes("beginner_friendliness_unknown"), false);
assert.deepEqual(pcx.semantic_fields_used, ["usage_tags"]);

const noSemanticInput = shortlistModels(
  knowledgeBase,
  { budget_wan: 3 },
  { allowUnapprovedPreview: true, semanticEnrichment },
);
assert.ok(noSemanticInput.candidates.every((candidate) => candidate.internal_semantic_signal === 0));

console.log("rules-engine: 7 scenarios passed");
