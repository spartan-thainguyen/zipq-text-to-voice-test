import { appendFileSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PATHS } from "./config.mjs";
import { clip, runStamp } from "./util.mjs";

export class Recorder {
  constructor({ envName, suiteName, meta = {} }) {
    this.runId = `${runStamp()}_${envName}_${suiteName}`;
    this.dir = join(PATHS.resultsDir, this.runId);
    mkdirSync(join(this.dir, "raw"), { recursive: true });
    this.context = {};
    this.findings = [];
    this.turns = [];
    this.meta = { runId: this.runId, startedAt: new Date().toISOString(), ...meta };
    this.write("run.json", this.meta);
    this.linkLatest();
  }

  linkLatest() {
    const latest = join(PATHS.resultsDir, "latest");
    try {
      rmSync(latest, { force: true });
      symlinkSync(this.dir, latest);
    } catch {
      return;
    }
  }

  write(name, data) {
    writeFileSync(join(this.dir, name), JSON.stringify(data, null, 2));
  }

  append(file, record) {
    appendFileSync(join(this.dir, file), `${JSON.stringify(record)}\n`);
  }

  setContext(context) {
    this.context = { ...context };
  }

  mergeContext(context) {
    this.context = { ...this.context, ...context };
  }

  stamp(extra = {}) {
    return { ts: new Date().toISOString(), runId: this.runId, ...this.context, ...extra };
  }

  finding({ severity, code, message, data, source = "runner", context }) {
    const record = this.stamp({ ...context, kind: "finding", severity, code, source, message: clip(message, 400), data });
    this.findings.push(record);
    this.append("findings.jsonl", record);
    this.append("events.jsonl", record);
    return record;
  }

  event(kind, data = {}) {
    this.append("events.jsonl", this.stamp({ kind, ...data }));
  }

  turn(turn, context) {
    const record = this.stamp({ ...context, kind: "turn", ...turn });
    this.turns.push(record);
    this.append("turns.jsonl", record);
    this.append("events.jsonl", record);
    return record;
  }

  raw(name, payload) {
    writeFileSync(join(this.dir, "raw", `${name}.json`), JSON.stringify(payload, null, 2));
  }

  finish(summary) {
    this.meta = { ...this.meta, finishedAt: new Date().toISOString(), ...summary };
    this.write("run.json", this.meta);
  }
}
