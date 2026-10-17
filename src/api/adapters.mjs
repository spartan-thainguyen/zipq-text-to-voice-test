import { asArray, camelize, findAll, toMs } from "../util.mjs";

export function readThread(snapshot) {
  const thread = camelize(snapshot ?? {});
  return asArray(thread.userMessages).map((entry) => {
    const user = entry.userMessage ?? {};
    const agents = asArray(entry.agentConversations).map((conversation) => {
      const meta = conversation.agentConversation ?? {};
      const messages = asArray(conversation.agentMessages).map((item) => ({
        id: item.message?.id,
        text: item.message?.content ?? "",
        createdAt: toMs(item.message?.createdAt),
        toolCalls: asArray(item.toolCalls).map(readToolCall),
      }));
      return {
        id: meta.id,
        status: meta.status,
        createdAt: toMs(meta.createdAt),
        completedAt: toMs(meta.completedAt),
        messages,
      };
    });
    return { id: user.id, text: user.content ?? "", createdAt: toMs(user.createdAt), agents };
  });
}

function readToolCall(call) {
  const startedAt = toMs(call.startedAt);
  const completedAt = toMs(call.completedAt);
  return {
    id: call.toolCallId ?? call.id,
    name: call.name,
    input: call.input,
    output: call.output,
    ok: call.isSuccessful !== false,
    startedAt,
    completedAt,
    durationMs: startedAt != null && completedAt != null ? completedAt - startedAt : null,
  };
}

export function readTransactionIds(listResponse) {
  return findAll(listResponse, (node) => typeof node.id === "string" && ("name" in node || "title" in node)).map(
    (node) => node.id,
  );
}

export function readInstances(treeResponse) {
  return findAll(
    treeResponse,
    (node) => typeof node.id === "string" && typeof (node.display_name ?? node.displayName) === "string",
  ).map((node) => ({ id: node.id, name: node.display_name ?? node.displayName }));
}

export function readFieldValues(instanceResponse) {
  const raw = instanceResponse?.field_values ?? instanceResponse?.fieldValues ?? {};
  return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, entry?.value ?? null]));
}
