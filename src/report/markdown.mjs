const ms = (value) => (value == null ? "–" : `${value}`);
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderMarkdown(run, summary) {
  const { meta } = run;
  const lines = [];
  lines.push(`# Voice suite ${meta.runId}`, "");
  lines.push(`- env: **${meta.env}** (${meta.webUrl})`, `- suite: **${meta.suite}**, repeat ${meta.repeat}, git ${meta.git ?? "n/a"}`);
  lines.push(`- turns: ${summary.totalTurns}, failed: ${summary.failedTurns}`);
  lines.push(`- findings: critical ${summary.bySev.critical}, high ${summary.bySev.high}, medium ${summary.bySev.medium}, low ${summary.bySev.low}`);
  lines.push(`- bot audio observed via: ${meta.audioSources?.join(", ") || "nothing (audio timings unavailable)"}`, "");

  lines.push("## Findings by severity", "", "| severity | code | count | message | where |", "|---|---|---|---|---|");
  for (const f of summary.findingRows) {
    lines.push(`| ${f.severity} | ${f.code} | ${f.count} | ${cell(f.message)} | ${cell(f.where.join("; "))} |`);
  }

  lines.push("", "## Step results", "", "| script | step | pass | partial | said |", "|---|---|---|---|---|");
  for (const s of summary.stepRows) lines.push(`| ${s.script} | ${s.step} | ${s.passed}/${s.total} | ${s.partial} | ${cell(s.say?.slice(0, 80))} |`);

  lines.push("", "## Latency (ms, from end of user speech)", "", "| metric | p50 | p95 | max | n |", "|---|---|---|---|---|");
  for (const [name, v] of Object.entries(summary.latency)) lines.push(`| ${name} | ${ms(v.p50)} | ${ms(v.p95)} | ${ms(v.max)} | ${v.n} |`);

  lines.push("", "## Tool calls", "", "| tool | calls | failed | p50 | p95 | max |", "|---|---|---|---|---|---|");
  for (const t of summary.toolRows) lines.push(`| ${t.name} | ${t.count} | ${t.failed} | ${ms(t.p50)} | ${ms(t.p95)} | ${ms(t.max)} |`);

  lines.push("", "## Tool call timeline", "", "| script | step | tool | ok | started_at | completed_at | ms |", "|---|---|---|---|---|---|---|");
  for (const t of summary.toolTimeline) {
    lines.push(`| ${t.script} #${t.repeat} | ${t.step} | ${t.name} | ${t.ok ? "ok" : "FAILED"} | ${t.startedAt ?? "–"} | ${t.completedAt ?? "–"} | ${ms(t.durationMs)} |`);
  }

  lines.push("", "## Turns", "");
  for (const turn of run.turns) {
    lines.push(`### ${turn.script} #${turn.repeat} ${turn.step} — ${turn.status}`);
    lines.push(`- said: ${turn.say}`, `- heard: ${turn.heard || "–"}`, `- reply: ${turn.reply || "–"}`);
    lines.push(`- first audio ${ms(turn.metrics?.firstAudioMs)}ms, turn ${ms(turn.metrics?.turnTotalMs)}ms, tools ${turn.metrics?.toolCount} (${ms(turn.metrics?.toolTotalMs)}ms)`);
    for (const call of turn.toolCalls ?? []) lines.push(`  - ${call.name} ${call.ok ? "ok" : "FAILED"} ${call.startedAt ?? "–"} → ${call.completedAt ?? "–"} = ${ms(call.durationMs)}ms`);
    for (const a of turn.assertions.filter((x) => x.status === "fail")) lines.push(`  - FAIL ${a.name}: ${a.message}`);
    lines.push("");
  }
  return lines.join("\n");
}
