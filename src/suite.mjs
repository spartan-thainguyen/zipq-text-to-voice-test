import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { PATHS } from "./config.mjs";

export function listSuites() {
  return readdirSync(PATHS.suitesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export function loadSuite(name, { only } = {}) {
  const dir = join(PATHS.suitesDir, name);
  if (!existsSync(dir)) throw new Error(`Unknown suite "${name}". Available: ${listSuites().join(", ")}`);
  const read = (file) => parse(fillPlaceholders(readFileSync(join(dir, file), "utf8")));
  const meta = read("suite.yaml");
  const wanted = only?.length ? new Set(only.map((id) => id.toUpperCase())) : null;

  const scripts = readdirSync(dir)
    .filter((file) => file.endsWith(".yaml") && file !== "suite.yaml")
    .sort()
    .map((file) => ({ file, ...read(file) }))
    .filter((script) => !wanted || wanted.has(String(script.id).toUpperCase()));

  scripts.forEach(validateScript);
  if (!scripts.length) throw new Error(`No scripts selected in suite "${name}"${only ? ` for ${only.join(",")}` : ""}`);

  return { name, ...meta, scripts: scripts.map((script) => withBootstrap(withDefaults(script, meta), meta)) };
}

function fillPlaceholders(text) {
  const now = new Date();
  return text.replaceAll("{{year}}", String(now.getFullYear())).replaceAll("{{today_iso}}", now.toISOString().slice(0, 10));
}

function withDefaults(script, meta) {
  const extra = meta.defaults?.expect;
  if (!extra) return script;
  const steps = script.steps.map((step) => {
    if (!step.say) return step;
    const expect = { ...(step.expect ?? {}) };
    for (const [group, rules] of Object.entries(extra)) expect[group] = [...(expect[group] ?? []), ...rules];
    return { ...step, expect };
  });
  return { ...script, steps };
}

function validateScript(script) {
  if (!script.id || !Array.isArray(script.steps) || !script.steps.length) {
    throw new Error(`Script ${script.file} needs "id" and a non-empty "steps" list`);
  }
  script.steps.forEach((step, index) => {
    if (!step.id) step.id = `${script.id}.${index + 1}`;
    if (!step.say && !step.action) throw new Error(`Step ${step.id} needs "say" or "action"`);
  });
}

function withBootstrap(script, meta) {
  if (script.bootstrap === false || !meta.bootstrap?.say) return script;
  const step = { id: `${script.id}.0`, say: meta.bootstrap.say, bootstrap: true, expect: meta.bootstrap.expect };
  return { ...script, steps: [step, ...script.steps] };
}
