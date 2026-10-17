import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PATHS = {
  envDir: join(ROOT, "config", "env"),
  defaults: join(ROOT, "config", "defaults.json"),
  suitesDir: join(ROOT, "suites"),
  resultsDir: join(ROOT, "results"),
  stateDir: join(ROOT, ".state"),
  cacheDir: join(ROOT, ".cache"),
};

export function loadDotEnv(file = join(ROOT, ".env")) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function merge(base, extra) {
  if (Array.isArray(extra) || typeof extra !== "object" || extra === null) return extra ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    out[key] = key in base && typeof base[key] === "object" && !Array.isArray(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

export function listEnvironments() {
  return readdirSync(PATHS.envDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function loadEnvironment(name, env = process.env) {
  const file = join(PATHS.envDir, `${name}.json`);
  if (!existsSync(file)) {
    throw new Error(`Unknown environment "${name}". Available: ${listEnvironments().join(", ")}`);
  }
  const merged = merge(readJson(PATHS.defaults), readJson(file));
  const overrides = {
    webUrl: env.WEB_URL,
    apiUrl: env.API_URL,
    orgId: env.ORG_ID,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value) merged[key] = value;
  }
  merged.apiUrl = merged.apiUrl.replace(/\/+$/, "");
  merged.profileDir = join(PATHS.stateDir, merged.name, "profile");
  return merged;
}
