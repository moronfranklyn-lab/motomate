import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { analyzeUsedListing } = require("../used-text-risk-tool.js");

const completeCore = analyzeUsedListing({
  model: "示例车型",
  year: 2024,
  mileage_km: 8000,
  listing_price_cny: 16000,
  condition: "卖家称正常使用",
  seller_description: "个人一手",
});
assert.equal(completeCore.extracted_fields.model, "示例车型");
assert.ok(Array.isArray(completeCore.information_gaps));
assert.ok(Array.isArray(completeCore.seller_questions));
assert.ok(completeCore.inspection_checklist.length >= 5);
assert.match(completeCore.not_a_vehicle_inspection_disclaimer, /不能鉴定/);

const incomplete = analyzeUsedListing({ model: "示例车型", listing_price_cny: 16000 });
assert.deepEqual(
  ["year", "mileage_km", "condition"].filter((field) => incomplete.missing_fields.includes(field)),
  ["year", "mileage_km", "condition"],
);
assert.equal(incomplete.fabricated_condition_forbidden, true);
assert.equal("condition" in incomplete.extracted_fields, false);

const boundary = analyzeUsedListing({ raw_text: "帮我判断是不是事故泡水调表车" });
assert.equal(boundary.status, "guidance_only");
assert.equal(boundary.diagnosis_refused, true);
assert.equal(boundary.offline_inspection_guidance, true);
assert.match(boundary.not_a_vehicle_inspection_disclaimer, /线下专业检测/);

const neutralRequest = analyzeUsedListing({ raw_text: "帮我整理这条二手车源" });
assert.equal(neutralRequest.diagnosis_refused, false);
assert.equal(neutralRequest.status, "analysis_ready");

console.log("used-text-risk-tool: 4 scenarios passed");
