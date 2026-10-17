import { createHash } from "node:crypto";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const hash = (text) => createHash("sha1").update(text).digest("hex").slice(0, 16);

export function toMs(value) {
  if (value == null) return null;
  if (typeof value === "number") return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function camelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [camelKey(k), camelize(v)]));
  }
  return value;
}

export function findAll(value, predicate, out = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => findAll(item, predicate, out));
  } else if (value && typeof value === "object") {
    if (predicate(value)) out.push(value);
    Object.values(value).forEach((item) => findAll(item, predicate, out));
  }
  return out;
}

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function clip(text, max = 600) {
  const s = typeof text === "string" ? text : JSON.stringify(text);
  return s && s.length > max ? `${s.slice(0, max)}…` : s;
}

export function runStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-").replace("Z", "");
}
