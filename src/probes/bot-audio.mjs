import { sleep } from "../util.mjs";

const MERGE_GAP_MS = 400;

function mergeSegments(segments) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (last && segment.start - last.end <= MERGE_GAP_MS) {
      last.end = Math.max(last.end, segment.end);
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

export class BotAudioProbe {
  constructor(page) {
    this.page = page;
    this.rtcSegments = [];
    this.webAudioSegments = [];
    this.rtcOpenSince = null;
    this.rtcStates = [];
    this.running = false;
  }

  start() {
    this.running = true;
    this.loop = this.poll();
  }

  async stop() {
    this.running = false;
    await this.loop;
  }

  async poll() {
    while (this.running) {
      try {
        const events = await this.page.evaluate(() => window.__probe?.drain() ?? []);
        events.forEach((event) => this.ingest(event));
      } catch {
        await sleep(250);
      }
      await sleep(150);
    }
  }

  ingest(event) {
    if (event.type === "webaudio") {
      this.webAudioSegments.push({ start: event.t, end: event.t + event.durationMs, source: "webaudio" });
    } else if (event.type === "rtc_audio") {
      if (event.speaking) {
        this.rtcOpenSince = event.t;
      } else if (this.rtcOpenSince != null) {
        this.rtcSegments.push({ start: this.rtcOpenSince, end: event.t, source: "webrtc" });
        this.rtcOpenSince = null;
      }
    } else if (event.type === "rtc_state") {
      this.rtcStates.push({ t: event.t, state: event.state });
    }
  }

  segments() {
    const open = this.rtcOpenSince != null ? [{ start: this.rtcOpenSince, end: Date.now(), source: "webrtc" }] : [];
    return mergeSegments([...this.rtcSegments, ...open, ...this.webAudioSegments]);
  }

  activitySince(sinceMs) {
    return this.segments().filter((segment) => segment.end >= sinceMs);
  }

  isSpeakingNow(silenceMs) {
    const last = this.segments().at(-1);
    return Boolean(last) && Date.now() - last.end < silenceMs;
  }

  sources() {
    return [...new Set(this.segments().map((s) => s.source))];
  }
}
