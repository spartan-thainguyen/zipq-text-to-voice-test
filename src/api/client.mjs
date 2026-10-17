export class ApiError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}`);
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  constructor(env, sniffer, { onCall } = {}) {
    this.base = env.apiUrl;
    this.sniffer = sniffer;
    this.onCall = onCall;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(path, `${this.base}/`);
    Object.entries(query ?? {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
    const started = Date.now();
    const response = await fetch(url, {
      method,
      headers: this.sniffer.authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    this.onCall?.({
      method,
      path,
      status: response.status,
      ms: Date.now() - started,
      ...(response.ok ? {} : { error: text.slice(0, 300) }),
    });
    if (!response.ok) throw new ApiError(method, path, response.status, text.slice(0, 500));
    return text ? JSON.parse(text) : null;
  }

  get(path, query) {
    return this.request("GET", path, { query });
  }

  post(path, body = {}, query) {
    return this.request("POST", path, { body, query });
  }
}
