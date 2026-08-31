import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolvePriceQuery } = require("../price-resolver.js");

const fresh = resolvePriceQuery({
  cached_price_cny: 18800,
  price_status: "fresh",
  last_verified_at: "2026-08-31T10:00:00+08:00",
  rule_pool_eligible: true,
});
assert.equal(fresh.status, "cache_hit");
assert.equal(fresh.display_price_cny, 18800);
assert.equal(fresh.show_refresh_status, false);
assert.equal(fresh.first_choice_allowed, true);

const stale = resolvePriceQuery({
  cached_price_cny: 18800,
  price_status: "stale",
  last_verified_at: "2026-08-01T00:00:00+08:00",
  rule_pool_eligible: true,
});
assert.equal(stale.status, "stale_while_revalidate");
assert.equal(stale.display_price_cny, 18800);
assert.equal(stale.show_stale_value, true);
assert.equal(stale.show_refresh_status, true);
assert.equal(stale.refresh_status, "refreshing");
assert.equal(stale.model_memory_price_forbidden, true);

const staleBlocked = resolvePriceQuery({
  cached_price_cny: 18800,
  price_status: "stale",
});
assert.equal(staleBlocked.first_choice_allowed, false);

const conflict = resolvePriceQuery({
  price_conflict_type: "true_same_scope_conflict",
  difference_ratio: 0.12,
});
assert.equal(conflict.status, "price_conflict");
assert.equal(conflict.first_choice_allowed, false);
assert.equal(conflict.show_as_price_check_candidate, true);
assert.equal(conflict.candidate_bucket, "price_check");

const noCache = resolvePriceQuery({});
assert.equal(noCache.status, "verification_required");
assert.equal(noCache.display_price_cny, null);
assert.equal(noCache.first_choice_allowed, false);
assert.equal(noCache.model_memory_price_forbidden, true);

const unclearScope = resolvePriceQuery({
  cached_price_cny: 12980,
  price_conflict_type: "configuration_or_scope_unclear",
});
assert.equal(unclearScope.status, "cache_hit");
assert.equal(unclearScope.show_as_price_check_candidate, undefined);

console.log("price-resolver: 6 scenarios passed");
