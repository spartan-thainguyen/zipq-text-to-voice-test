import { evaluateImmediate } from "./assertions/index.mjs";
import { mergeToolCalls, readLiveToolCalls } from "./api/events.mjs";
import { FormWatcher } from "./api/form-state.mjs";
import { reportAssertions } from "./reply-resolver.mjs";
import { CODES } from "./severity.mjs";
import { clip, sleep } from "./util.mjs";

const norm = (text) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

function wordRecall(said, heard) {
  const wanted = norm(said);
  if (!wanted.length) return 1;
  const have = new Set(norm(heard));
  return wanted.filter((word) => have.has(word)).length / wanted.length;
}

const hasPendingTool = (turns) =>
  turns.some((turn) => turn.agents.some((agent) => agent.messages.some((m) => m.toolCalls.some((c) => c.completedAt == null))));

async function waitForSettle({ spoke, probe, reader, timing, onPoll }) {
  const hardDeadline = spoke.endedAt + timing.turnTimeoutMs;
  let firstAudioAt = null;
  let heardAt = null;
  let thread = null;
  let reason = "timeout";

  while (Date.now() < hardDeadline) {
    const untilSpeechEnds = spoke.endedAt - Date.now();
    if (untilSpeechEnds > 0) {
      await sleep(Math.min(timing.pollIntervalMs, untilSpeechEnds));
      continue;
    }
    const segments = probe.activitySince(spoke.startedAt).filter((s) => s.end > spoke.endedAt);
    if (segments.length && firstAudioAt == null) firstAudioAt = Math.max(segments[0].start, spoke.endedAt);

    thread = await reader.read().catch(() => thread);
    await onPoll?.(thread);
    const fresh = reader.fresh(thread);
    const heard = fresh.length > 0;
    if (heard && heardAt == null) heardAt = Date.now();
    const toolsPending = hasPendingTool(fresh);
    const quiet = !probe.isSpeakingNow(timing.settleSilenceMs);
    const now = Date.now();

    if (quiet && firstAudioAt != null && !toolsPending && (heard || !thread)) {
      reason = "settled";
      break;
    }
    if (firstAudioAt == null && heard && !toolsPending && probe.sources().length === 0 && now - heardAt > timing.noAudioFallbackMs) {
      reason = "settled-no-audio";
      break;
    }
    if (firstAudioAt == null && !toolsPending && now - spoke.endedAt > timing.firstAudioTimeoutMs) {
      reason = "no-reply";
      break;
    }
    await sleep(timing.pollIntervalMs);
  }
  return { firstAudioAt, thread, reason, settledAt: Date.now() };
}

function collect(thread, reader) {
  const fresh = reader.fresh(thread);
  const messages = fresh.flatMap((turn) => turn.agents.flatMap((agent) => agent.messages));
  return {
    agentConversationIds: fresh.flatMap((turn) => turn.agents.map((agent) => agent.id)).filter(Boolean),
    userIds: new Set(fresh.map((turn) => turn.id)),
    userText: fresh.map((turn) => turn.text).join(" ").trim(),
    toolCalls: messages.flatMap((m) => m.toolCalls),
  };
}

export async function runTurn(ctx, step) {
  const { env, session, probe, form, reader, recorder, resolver, state } = ctx;
  const { thresholds, timing } = env;

  const beforeValues = await form.snapshot().catch(() => null);
  await reader.markKnown();
  const spoke = await session.speak(step.say);
  const waited = await waitForSettle({ spoke, probe, reader, timing, onPoll: (thread) => resolver.poll(thread) });

  if (step.bootstrap && !form.isLocated()) {
    for (let attempt = 0; attempt < 15 && !form.isLocated(); attempt++) {
      await form.locate(state.knownTransactions).catch(() => false);
      if (!form.isLocated()) await sleep(timing.pollIntervalMs);
    }
    if (!form.isLocated()) {
      recorder.finding({ ...CODES.OBSERVABILITY_GAP, message: "could not find the new transaction or RPA instance; form assertions will be skipped" });
    }
  }

  const afterValues = await form.snapshot().catch(() => null);
  const changes = afterValues ? FormWatcher.diff(beforeValues, afterValues) : {};
  const { userIds, userText, toolCalls: threadTools, agentConversationIds } = collect(waited.thread, reader);
  const live = await readLiveToolCalls({ env, sniffer: ctx.sniffer, conversationId: ctx.sniffer.conversationId, agentConversationIds }).catch((error) => {
    recorder.finding({ ...CODES.OBSERVABILITY_GAP, message: `live tool events unavailable: ${error.message}` });
    return { toolCalls: [], events: [] };
  });
  for (let attempt = 0; attempt < 8 && live.toolCalls.some((call) => call.completedAt == null); attempt++) {
    await sleep(timing.pollIntervalMs * 2);
    Object.assign(live, await readLiveToolCalls({ env, sniffer: ctx.sniffer, conversationId: ctx.sniffer.conversationId, agentConversationIds }).catch(() => live));
  }
  const toolCalls = mergeToolCalls(live.toolCalls, threadTools);

  if (!waited.thread) {
    recorder.finding({ ...CODES.OBSERVABILITY_GAP, message: "no conversation thread readable; tool calls and transcript unavailable" });
  }

  const segments = probe.activitySince(spoke.startedAt).filter((s) => s.end > spoke.endedAt);
  const lastAudioEnd = segments.at(-1)?.end ?? null;
  const metrics = {
    speechMs: spoke.durationMs,
    firstAudioMs: waited.firstAudioAt != null ? waited.firstAudioAt - spoke.endedAt : null,
    turnTotalMs: (lastAudioEnd ?? waited.settledAt) - spoke.endedAt,
    botSpeakMs: segments.reduce((sum, s) => sum + (s.end - s.start), 0),
    toolCount: toolCalls.length,
    toolTotalMs: toolCalls.reduce((sum, c) => sum + (c.durationMs ?? 0), 0),
    settle: waited.reason,
  };

  if (waited.reason === "no-reply") {
    recorder.finding({ ...CODES.NO_REPLY, message: `no reply to: ${clip(step.say, 120)}` });
  }
  if (waited.reason === "timeout") {
    recorder.finding({ ...CODES.TURN_TIMEOUT, message: `turn did not settle within ${timing.turnTimeoutMs}ms` });
  }
  if (metrics.firstAudioMs != null && metrics.firstAudioMs > thresholds.speechEndToFirstAudioMs) {
    recorder.finding({ ...CODES.SLOW_FIRST_AUDIO, message: `first audio ${metrics.firstAudioMs}ms after speech end (limit ${thresholds.speechEndToFirstAudioMs})` });
  }
  if (metrics.turnTotalMs > thresholds.turnTotalMs) {
    recorder.finding({ ...CODES.SLOW_TURN, message: `turn took ${metrics.turnTotalMs}ms (limit ${thresholds.turnTotalMs})` });
  }
  if (userText && wordRecall(step.say, userText) < 0.5) {
    recorder.finding({ ...CODES.STT_MISMATCH, message: `said ${JSON.stringify(clip(step.say, 160))} heard ${JSON.stringify(clip(userText, 160))}` });
  }

  const turn = { userText, toolCalls, changes, values: afterValues };
  const immediate = evaluateImmediate({ form: step.expect?.form }, turn);
  reportAssertions(recorder, immediate, undefined);

  resolver.add({
    context: { ...recorder.context },
    userIds,
    userText,
    toolCalls,
    threadAgentIds: new Set(agentConversationIds),
    changes,
    values: afterValues,
    expect: step.expect ?? {},
    bootstrap: Boolean(step.bootstrap),
    immediate,
    base: {
      step: step.id,
      say: step.say,
      heard: userText,
      metrics,
      changes,
    },
  });
  await resolver.poll(waited.thread);
  return { metrics, raw: { thread: waited.thread?.raw, values: afterValues, liveEvents: live.events } };
}
