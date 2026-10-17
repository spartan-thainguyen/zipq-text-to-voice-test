import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRun } from "./load.mjs";
import { renderMarkdown } from "./markdown.mjs";
import { buildSummary } from "./summary.mjs";

export function writeReport(dir) {
  const run = loadRun(dir);
  const summary = buildSummary(run);
  const markdownPath = join(dir, "summary.md");
  writeFileSync(markdownPath, renderMarkdown(run, summary));
  writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  const { bySev, totalTurns, failedTurns } = summary;
  const partial = run.turns.filter((t) => t.status === "partial").length;
  const headline = `turns ${totalTurns - failedTurns - partial}/${totalTurns} passed, ${partial} partial, ${failedTurns} failed | critical ${bySev.critical} high ${bySev.high} medium ${bySev.medium} low ${bySev.low}`;
  return { markdownPath, headline, summary };
}
