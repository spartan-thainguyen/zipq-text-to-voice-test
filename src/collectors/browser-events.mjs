import { CODES } from "../severity.mjs";

const IGNORED_CONSOLE = [/Failed to load resource/i, /DevTools/i, /\[vite\]/i];

export function attachBrowserCollector(page, env, recorder) {
  const ignored = (env.ignoreRequestErrors ?? []).map((pattern) => new RegExp(pattern));
  const isIgnored = (text) => ignored.some((re) => re.test(text));
  const seen = new Map();

  const report = (spec, message, data) => {
    const key = `${recorder.context.step ?? ""}|${spec.code}|${message}`;
    if (seen.has(key)) return;
    seen.set(key, true);
    recorder.finding({ ...spec, source: "browser", message, data });
  };

  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text)) || isIgnored(text)) return;
    report(type === "error" ? CODES.BROWSER_CONSOLE_ERROR : CODES.BROWSER_CONSOLE_WARN, text, {
      location: msg.location(),
    });
  });

  page.on("pageerror", (error) => {
    report(CODES.BROWSER_PAGE_ERROR, error.message, { stack: error.stack });
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText ?? "unknown";
    if (failure.includes("ERR_ABORTED") || isIgnored(url)) return;
    report(CODES.REQUEST_FAILED, `${request.method()} ${url} ${failure}`);
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const request = response.request();
    const url = response.url();
    if (!url.startsWith(env.apiUrl) || isIgnored(url)) return;
    const spec = status >= 500 ? CODES.HTTP_5XX : CODES.HTTP_4XX;
    report(spec, `${status} ${request.method()} ${new URL(url).pathname}`, { url, status });
  });

  page.on("websocket", (socket) => {
    recorder.event("websocket_open", { url: socket.url() });
    socket.on("socketerror", (error) => report(CODES.SOCKET_CLOSED, `${socket.url()} ${error}`));
    socket.on("close", () => recorder.event("websocket_close", { url: socket.url() }));
  });
}
