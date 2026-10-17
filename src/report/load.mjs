import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

export function loadRun(dir) {
  return {
    dir,
    meta: JSON.parse(readFileSync(join(dir, "run.json"), "utf8")),
    turns: readJsonl(join(dir, "turns.jsonl")),
    findings: readJsonl(join(dir, "findings.jsonl")),
  };
}
