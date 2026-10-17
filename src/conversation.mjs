import { readThread } from "./api/adapters.mjs";
import { findAll } from "./util.mjs";

export class ConversationReader {
  constructor(api, sniffer, recorder) {
    this.api = api;
    this.sniffer = sniffer;
    this.recorder = recorder;
    this.known = new Set();
    this.warned = false;
  }

  reset() {
    this.known = new Set();
    this.warned = false;
  }

  async conversationId() {
    if (this.sniffer.conversationId) return this.sniffer.conversationId;
    try {
      const sessions = await this.api.get("/api/v1/agent/chat/sessions");
      this.recorder.raw("agent-chat-sessions", sessions);
      const found = findAll(sessions, (node) => typeof node.conversation_id === "string")[0];
      if (found) this.sniffer.conversationId = found.conversation_id;
    } catch {
      return null;
    }
    return this.sniffer.conversationId;
  }

  async read() {
    const id = await this.conversationId();
    if (!id) return null;
    const snapshot = await this.api.get("/api/v1/agent/chat/thread", { conversation_id: id, depth: 20 });
    this.lastRaw = snapshot;
    this.lastThread = { raw: snapshot, turns: readThread(snapshot) };
    return this.lastThread;
  }

  async markKnown() {
    const thread = await this.read().catch(() => null);
    this.known = new Set(thread?.turns.map((turn) => turn.id) ?? []);
  }

  fresh(thread) {
    return (thread?.turns ?? []).filter((turn) => !this.known.has(turn.id));
  }
}
