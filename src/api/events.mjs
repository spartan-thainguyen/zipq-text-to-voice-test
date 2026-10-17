import { asArray, camelize, toMs } from "../util.mjs";

function parseFrames(buffer) {
  const frames = buffer.split(/\r?\n\r?\n/);
  const rest = frames.pop() ?? "";
  const payloads = frames
    .map((frame) =>
      frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join(""),
    )
    .filter(Boolean);
  return { payloads, rest };
}

function normalize(payload) {
  try {
    const parsed = camelize(JSON.parse(payload));
    return parsed.event && typeof parsed.event === "object" ? { ...parsed.event, type: parsed.event.type ?? parsed.type } : parsed;
  } catch {
    return null;
  }
}

export function foldToolEvents(events) {
  const calls = new Map();
  for (const event of events) {
    if (event.type !== "tool-call-started" && event.type !== "tool-call-completed") continue;
    const key = event.toolCallId ?? `${event.name}|${event.messageId}`;
    const call = calls.get(key) ?? { id: event.toolCallId, name: event.name, input: event.input, ok: true, startedAt: null, completedAt: null };
    if (event.type === "tool-call-started") {
      call.startedAt = toMs(event.timestamp);
    } else {
      call.completedAt = toMs(event.timestamp);
      call.output = event.output;
      call.ok = event.isSuccessful !== false;
    }
    calls.set(key, call);
  }
  return [...calls.values()].map((call) => ({
    ...call,
    durationMs: call.startedAt != null && call.completedAt != null ? call.completedAt - call.startedAt : null,
  }));
}

async function readStream(url, headers, { idleMs, capMs }) {
  const controller = new AbortController();
  const events = [];
  let idle = setTimeout(() => controller.abort(), idleMs);
  const cap = setTimeout(() => controller.abort(), capMs);
  try {
    const response = await fetch(url, { headers: { ...headers, accept: "text/event-stream" }, signal: controller.signal });
    if (!response.ok) throw new Error(`events HTTP ${response.status}`);
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), idleMs);
      buffer += decoder.decode(chunk, { stream: true });
      const { payloads, rest } = parseFrames(buffer);
      buffer = rest;
      payloads.map(normalize).filter(Boolean).forEach((event) => events.push(event));
      if (events.some((event) => event.type === "agent-completed")) break;
    }
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  } finally {
    clearTimeout(idle);
    clearTimeout(cap);
    controller.abort();
  }
  return events;
}

export async function readLiveToolCalls({ env, sniffer, conversationId, agentConversationIds, idleMs = 700, capMs = 4000 }) {
  const events = [];
  for (const agentConversationId of asArray(agentConversationIds)) {
    const url = new URL("/api/v1/agent/chat/events", `${env.apiUrl}/`);
    url.searchParams.set("conversation_id", conversationId);
    url.searchParams.set("agent_conversation_id", agentConversationId);
    url.searchParams.set("from_offset", "-1");
    events.push(...(await readStream(url, sniffer.authHeaders(), { idleMs, capMs })));
  }
  return { toolCalls: foldToolEvents(events), events };
}

export function mergeToolCalls(live, fromThread) {
  const merged = new Map();
  const keyOf = (call) => call.id ?? `${call.name}|${call.startedAt}`;
  for (const call of asArray(live)) merged.set(keyOf(call), call);
  for (const call of asArray(fromThread)) {
    const key = keyOf(call);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, ...Object.fromEntries(Object.entries(call).filter(([, v]) => v != null)) } : call);
  }
  return [...merged.values()];
}
