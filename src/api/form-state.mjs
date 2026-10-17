import { readFieldValues, readInstances, readTransactionIds } from "./adapters.mjs";

const TRUTHY = new Set(["true", "yes", "y", "on", "x", "1", "checked", "✓"]);

export const isEmptyValue = (value) => value == null || String(value).trim() === "";
export const isChecked = (value) => TRUTHY.has(String(value ?? "").trim().toLowerCase());

export class FormWatcher {
  constructor(api, document) {
    this.api = api;
    this.matcher = new RegExp(document.match, "i");
    this.transactionId = null;
    this.instanceId = null;
    this.before = null;
  }

  async listTransactionIds() {
    return new Set(readTransactionIds(await this.api.post("/api/v1/transactions/list", { page: 0, page_size: 100 })));
  }

  async locate(knownIds) {
    const current = await this.listTransactionIds();
    const created = [...current].filter((id) => !knownIds.has(id));
    if (!created.length) return false;
    this.transactionId = created[0];
    const tree = await this.api.get("/api/v1/document-projects/instances", { project_id: this.transactionId });
    const instance = readInstances(tree).find((item) => this.matcher.test(item.name));
    if (!instance) return false;
    this.instanceId = instance.id;
    return true;
  }

  isLocated() {
    return Boolean(this.instanceId);
  }

  async snapshot() {
    if (!this.instanceId) return null;
    const response = await this.api.get("/api/v1/document-projects/instance", { id: this.instanceId });
    return readFieldValues(response);
  }

  static diff(before, after) {
    const changes = {};
    for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
      const from = before?.[key] ?? null;
      const to = after?.[key] ?? null;
      if (String(from ?? "") !== String(to ?? "")) changes[key] = { from, to };
    }
    return changes;
  }
}
