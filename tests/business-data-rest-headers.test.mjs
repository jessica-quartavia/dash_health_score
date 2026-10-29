import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_SCHEMA } from "../lib/business-data/config.mjs";
import { businessRestHeaders } from "../lib/business-data/rest.mjs";

test("Business Data REST usa Accept-Profile e Content-Profile em _dash_health_score", () => {
  const prevUrl = process.env.BUSINESS_SUPABASE_URL;
  const prevKey = process.env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY;
  process.env.BUSINESS_SUPABASE_URL = "https://rckpuebaiswrxzmywllv.supabase.co";
  process.env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY = "test-key-not-real";

  const h = businessRestHeaders();
  assert.equal(h["Accept-Profile"], BUSINESS_SCHEMA);
  assert.equal(h["Content-Profile"], BUSINESS_SCHEMA);
  assert.notEqual(h["Accept-Profile"], "api");
  assert.notEqual(h["Accept-Profile"], "public");
  assert.match(h.Authorization, /^Bearer /);

  if (prevUrl == null) delete process.env.BUSINESS_SUPABASE_URL;
  else process.env.BUSINESS_SUPABASE_URL = prevUrl;
  if (prevKey == null) delete process.env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY;
  else process.env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY = prevKey;
});
