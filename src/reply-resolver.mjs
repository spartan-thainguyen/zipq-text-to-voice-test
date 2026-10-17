import { evaluateReplyRules, evaluateToolRules, skipReplyRules } from "./assertions/index.mjs";
import { mergeToolCalls } from "./api/events.mjs";
import { CODES } from "./severity.mjs";
import { clip, sleep } from "./util.mjs";

const norm = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
const isoOrNull = (ms) => (ms == null ? null : new Date(ms).toISOString());
const isFinished = (agent) => agent.status && agent.status !== "PROCESSING";

export function reportAssertions(recorder, results, context) {
  for (const result of results) {
    if (result.status === "fail") {
      recorder.finding({ severity: result.severity, code: CODES.ASSERTION_FAILED.code, source: "assertion", message: `${result.name}: ${result.message}`, data: result.data, context });
    } else if (result.status === "skip") {
      recorder.finding({ ...CODES.ASSERTION_SKIPPED, source: "assertion", message: `${result.name}: ${result.message}`, context });
    }
  }
}

export class ReplyResolver {
  constructor({ reader, recorder, judge, thresholds, log = () => {} }) {
    this.thresholds = thresholds;
    this.reader = reader;
    this.recorder = recorder;
    this.judge = judge;
    this.log = log;
    this.pending = [];
    this.lastReply = null;
  }

  add(entry) {
    this.pending.push(entry);
  }

  replyFor(entry, thread) {
    const turns = (thread?.turns ?? []).filter((turn) => entry.userIds.has(turn.id));
    if (!turns.length) return null;
    const agents = turns.flatMap((turn) => turn.agents);
    if (!agents.length || !agents.every(isFinished)) return null;
    const messages = agents.flatMap((agent) => agent.messages);
    return messages.length ? messages.map((m) => m.text).join(" ").trim() : null;
  }

  async poll(thread) {
    while (this.pending.length) {
      const reply = this.replyFor(this.pending[0], thread);
      if (reply == null) return;
      await this.finalize(this.pending.shift(), reply, thread);
    }
  }

  async flush(graceMs, pollMs = 500) {
    const deadline = Date.now() + graceMs;
    while (this.pending.length && Date.now() < deadline) {
      const thread = await this.reader.read().catch(() => null);
      await this.poll(thread);
      if (this.pending.length) await sleep(pollMs);
    }
    while (this.pending.length) await this.finalize(this.pending.shift(), null, null);
  }

  threadTools(entry, thread) {
    return (thread?.turns ?? [])
      .filter((turn) => entry.userIds.has(turn.id))
      .flatMap((turn) => turn.agents.flatMap((agent) => agent.messages.flatMap((m) => m.toolCalls)));
  }

  async finalize(entry, reply, thread) {
    const { recorder, judge, thresholds } = this;
    const context = entry.context;
    const toolCalls = mergeToolCalls(entry.toolCalls, this.threadTools(entry, thread ?? this.reader.lastThread));
    const metrics = {
      ...entry.base.metrics,
      toolCount: toolCalls.length,
      toolTotalMs: toolCalls.reduce((sum, call) => sum + (call.durationMs ?? 0), 0),
    };
    for (const call of toolCalls) {
      if (!call.ok) recorder.finding({ ...CODES.TOOL_FAILED, source: "backend", message: `${call.name} failed`, data: { input: clip(call.input), output: clip(call.output) }, context });
      if (call.durationMs != null && call.durationMs > thresholds.toolMs) {
        recorder.finding({ ...CODES.SLOW_TOOL, source: "backend", message: `${call.name} took ${call.durationMs}ms (limit ${thresholds.toolMs})`, context });
      }
    }
    const toolResults = evaluateToolRules(entry.expect, { toolCalls });
    reportAssertions(recorder, toolResults, context);
    const turn = { userText: entry.userText, assistantText: reply ?? "", toolCalls, changes: entry.changes, values: entry.values };
    const replyResults = reply == null
      ? skipReplyRules(entry.expect, "reply not written by the backend")
      : await evaluateReplyRules(entry.expect, turn, judge);
    reportAssertions(recorder, replyResults, context);

    if (reply && this.lastReply && !entry.bootstrap && norm(reply) === norm(this.lastReply)) {
      recorder.finding({ ...CODES.REPEATED_REPLY, message: `same reply twice in a row: ${clip(reply, 160)}`, context });
    }
    if (reply) this.lastReply = reply;

    const assertions = [...entry.immediate, ...toolResults, ...replyResults];
    const failed = assertions.some((a) => a.status === "fail");
    const skipped = assertions.some((a) => a.status === "skip");
    const status = failed ? "fail" : skipped ? "partial" : "pass";
    const toolRecords = toolCalls.map(({ name, ok, startedAt, completedAt, input, output }) => ({
      name,
      ok,
      startedAt: isoOrNull(startedAt),
      completedAt: isoOrNull(completedAt),
      durationMs: startedAt != null && completedAt != null ? completedAt - startedAt : null,
      input: clip(input, 400),
      output: clip(output, 400),
    }));
    recorder.turn({ ...entry.base, metrics, toolCalls: toolRecords, reply: reply ?? "", assertions, status }, context);
    this.log(entry.base.step, status);
  }
}
