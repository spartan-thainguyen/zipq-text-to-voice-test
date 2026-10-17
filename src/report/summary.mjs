import { bySeverity, SEVERITY } from "../severity.mjs";
import { percentile } from "../util.mjs";

const SEVERITIES = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW];

export function buildSummary(run) {
  const { turns, findings } = run;

  const bySev = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length]));

  const steps = new Map();
  for (const turn of turns) {
    const key = `${turn.script}|${turn.step}`;
    const entry = steps.get(key) ?? { script: turn.script, step: turn.step, say: turn.say, runs: [] };
    entry.runs.push(turn.status);
    steps.set(key, entry);
  }
  const stepRows = [...steps.values()].map((entry) => ({
    ...entry,
    passed: entry.runs.filter((s) => s === "pass").length,
    partial: entry.runs.filter((s) => s === "partial").length,
    total: entry.runs.length,
  }));

  const scripts = new Map();
  for (const turn of turns) {
    const key = `${turn.script}|${turn.repeat}`;
    const entry = scripts.get(key) ?? { script: turn.script, repeat: turn.repeat, failed: 0, turns: 0 };
    entry.turns += 1;
    if (turn.status === "fail") entry.failed += 1;
    scripts.set(key, entry);
  }

  const metric = (name) => turns.map((t) => t.metrics?.[name]).filter((v) => v != null);
  const latency = Object.fromEntries(
    ["firstAudioMs", "turnTotalMs", "botSpeakMs", "toolTotalMs"].map((name) => [
      name,
      { p50: percentile(metric(name), 50), p95: percentile(metric(name), 95), max: percentile(metric(name), 100), n: metric(name).length },
    ]),
  );

  const tools = new Map();
  for (const turn of turns) {
    for (const call of turn.toolCalls ?? []) {
      const entry = tools.get(call.name) ?? { name: call.name, durations: [], failed: 0, count: 0 };
      entry.count += 1;
      if (!call.ok) entry.failed += 1;
      if (call.durationMs != null) entry.durations.push(call.durationMs);
      tools.set(call.name, entry);
    }
  }
  const toolRows = [...tools.values()]
    .map((t) => ({ name: t.name, count: t.count, failed: t.failed, p50: percentile(t.durations, 50), p95: percentile(t.durations, 95), max: percentile(t.durations, 100) }))
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));

  const toolTimeline = turns.flatMap((turn) =>
    (turn.toolCalls ?? []).map((call) => ({
      script: turn.script,
      repeat: turn.repeat,
      step: turn.step,
      name: call.name,
      ok: call.ok,
      startedAt: call.startedAt,
      completedAt: call.completedAt,
      durationMs: call.startedAt && call.completedAt ? Date.parse(call.completedAt) - Date.parse(call.startedAt) : call.durationMs,
    })),
  );

  const grouped = new Map();
  for (const finding of findings) {
    const key = `${finding.severity}|${finding.code}|${finding.message}`;
    const entry = grouped.get(key) ?? { ...finding, count: 0, where: [] };
    entry.count += 1;
    const where = [finding.script, finding.repeat != null ? `#${finding.repeat}` : null, finding.step].filter(Boolean).join(" ");
    if (where && entry.where.length < 4) entry.where.push(where);
    grouped.set(key, entry);
  }
  const findingRows = [...grouped.values()].sort((a, b) => bySeverity(a, b) || b.count - a.count);

  const totalTurns = turns.length;
  const failedTurns = turns.filter((t) => t.status === "fail").length;
  return { bySev, stepRows, scriptRuns: [...scripts.values()], latency, toolRows, toolTimeline, findingRows, totalTurns, failedTurns };
}
