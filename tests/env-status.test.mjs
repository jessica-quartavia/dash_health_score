import test from "node:test";
import assert from "node:assert/strict";
import { dataConfigurationError } from "../lib/env.mjs";
import { classifyHttpStatus } from "../lib/data/supabase-rest.mjs";

test("configuração ausente nomeia a variável e não expõe segredo", () => {
  const previous = {
    DATA_SUPABASE_URL: process.env.DATA_SUPABASE_URL,
    DATA_SUPABASE_SERVICE_ROLE_KEY: process.env.DATA_SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  delete process.env.DATA_SUPABASE_URL;
  delete process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const error = dataConfigurationError();
    assert.equal(error.code, "DATA_CONFIG");
    assert.match(error.message, /DATA_SUPABASE_URL/);
    assert.match(error.message, /DATA_SUPABASE_SERVICE_ROLE_KEY/);
    assert.equal(error.message.includes("eyJ"), false);
    assert.equal(/https?:\/\//.test(error.message), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("URL presente sem HTTPS é inválida, não ausente", () => {
  const previous = {
    DATA_SUPABASE_URL: process.env.DATA_SUPABASE_URL,
    DATA_SUPABASE_SERVICE_ROLE_KEY: process.env.DATA_SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.DATA_SUPABASE_URL = "http://example.invalid";
  process.env.DATA_SUPABASE_SERVICE_ROLE_KEY = "presente-nao-secreto";
  try {
    const error = dataConfigurationError();
    assert.equal(error.code, "DATA_CONFIG_INVALID");
    assert.match(error.message, /inválida/);
    assert.equal(error.message.includes("example.invalid"), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("status HTTP separa autenticação, permissão e consulta", () => {
  assert.equal(classifyHttpStatus(401).code, "DATA_AUTH");
  assert.equal(classifyHttpStatus(403).code, "DATA_PERMISSION");
  assert.equal(classifyHttpStatus(500).code, "DATA_UPSTREAM");
  assert.equal(classifyHttpStatus(400).code, "DATA_QUERY");
});
