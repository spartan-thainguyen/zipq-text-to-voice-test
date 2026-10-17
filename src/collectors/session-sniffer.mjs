const REPLAYED_HEADERS = ["x-org-id", "x-session-id", "x-assistant-profile", "x-terminology-version"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SessionSniffer {
  constructor(page, env) {
    this.apiUrl = env.apiUrl;
    this.configuredOrgId = env.orgId ?? null;
    this.headers = {};
    this.conversationId = null;
    this.agentConversationIds = new Set();
    page.on("request", (request) => this.onRequest(request));
  }

  reset() {
    this.conversationId = null;
    this.agentConversationIds.clear();
  }

  onRequest(request) {
    const url = request.url();
    if (!url.startsWith(this.apiUrl)) return;
    const headers = request.headers();
    if (headers.authorization) this.headers.authorization = headers.authorization;
    for (const name of REPLAYED_HEADERS) {
      if (headers[name]) this.headers[name] = headers[name];
    }
    const parsed = new URL(url);
    this.take(parsed.searchParams.get("conversation_id"), "conversationId");
    this.takeAgent(parsed.searchParams.get("agent_conversation_id"));
    const body = request.postData();
    if (body && body.includes("conversation_id")) {
      try {
        const json = JSON.parse(body);
        this.take(json.conversation_id, "conversationId");
        this.takeAgent(json.agent_conversation_id);
      } catch {
        return;
      }
    }
  }

  take(value, field) {
    if (typeof value === "string" && UUID.test(value)) this[field] = value;
  }

  takeAgent(value) {
    if (typeof value === "string" && UUID.test(value)) this.agentConversationIds.add(value);
  }

  authHeaders() {
    const headers = { accept: "application/json", "content-type": "application/json", "x-terminology-version": "2", ...this.headers };
    if (this.configuredOrgId) headers["x-org-id"] = this.configuredOrgId;
    return headers;
  }

  hasAuth() {
    return Boolean(this.headers.authorization);
  }
}
