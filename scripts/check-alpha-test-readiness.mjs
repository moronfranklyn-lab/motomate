import fs from "node:fs";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync("testing/internal-alpha-readiness.json", "utf8"));
const pool = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json", "utf8"));

const requiredFiles = [
  "testing/首轮内部Alpha测试执行手册.md",
  "testing/首轮观察记录模板.csv",
  "testing/五人测试结果汇总模板.md",
];

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8", timeout: 30000 });
}

const smoke = run("node", ["scripts/run-smoke-evals.mjs", "--require-all"]);
const golden = run("node", ["scripts/run-golden-evals.mjs"]);
const api = run("node", ["scripts/test-alpha-api.mjs"]);
const appSource = fs.readFileSync("app.js", "utf8");
const apiSource = fs.readFileSync("server/alpha-api.js", "utf8");
const memorySource = fs.readFileSync("server/memory-store.js", "utf8");

const supervisedChecks = {
  engineering_smoke_20_passed: smoke.status === 0 && /"passed": 20/.test(smoke.stdout),
  alpha_api_passed: api.status === 0 && /alpha-api: \d+ scenarios passed/.test(api.stdout),
  development_preview_disclaimer_visible: /尚未获得正式推荐批准|未完成正式推荐批准/.test(appSource),
  feedback_review_available: apiSource.includes("/api/internal/feedback-summary"),
  short_term_memory_ttl_enforced: /SHORT_TERM_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(memorySource),
  memory_management_available: ["/api/memory", "/api/memory/settings"].every((route) => apiSource.includes(route)),
  moderator_present: requiredFiles.every((file) => fs.existsSync(file)),
};

const externalChecks = {
  recommendation_batch_approved: pool.recommendation_approved_count > 0,
  golden_eval_50_passed: golden.status === 0 && /"passed": 50/.test(golden.stdout),
  authentication_available: false,
  cloud_database_and_backup_available: false,
  user_data_deletion_available: false,
  invitation_and_capacity_control_available: false,
  daily_usage_limit_available: false,
  paid_model_cost_metering_available: false,
  admin_endpoint_protected: false,
};

function evaluate(requiredChecks, checks) {
  const blockers = requiredChecks.filter((check) => checks[check] !== true);
  return { ready: blockers.length === 0, checks, blockers };
}

const result = {
  schema_version: manifest.schema_version,
  evaluated_at: new Date().toISOString(),
  supervised_usability: evaluate(manifest.stages.supervised_usability.required_checks, supervisedChecks),
  external_invited_alpha: evaluate(manifest.stages.external_invited_alpha.required_checks, externalChecks),
};

console.log(JSON.stringify(result, null, 2));
if (!result.supervised_usability.ready) process.exitCode = 1;
