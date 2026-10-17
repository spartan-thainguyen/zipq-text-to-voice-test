export function installPageHooks() {
  const probe = { events: [] };
  window.__probe = probe;
  probe.drain = () => probe.events.splice(0, probe.events.length);
  const emit = (event) => probe.events.push({ t: Date.now(), ...event });

  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  navigator.mediaDevices.getUserMedia = async () => dest.stream.clone();

  window.speak = async (b64) => {
    await ac.resume();
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const buf = await ac.decodeAudioData(bytes.buffer);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.__ours = true;
    src.connect(dest);
    const startedAt = Date.now();
    src.start();
    return { startedAt, durationMs: Math.round(buf.duration * 1000) };
  };

  const nativeStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (!this.__ours && this.buffer) {
      emit({ type: "webaudio", durationMs: Math.round(this.buffer.duration * 1000) });
    }
    return nativeStart.apply(this, args);
  };

  const Native = window.RTCPeerConnection;
  if (Native) {
    const peers = new Set();
    const Wrapped = function (...args) {
      const pc = new Native(...args);
      peers.add(pc);
      pc.addEventListener("connectionstatechange", () => {
        emit({ type: "rtc_state", state: pc.connectionState });
        if (pc.connectionState === "closed" || pc.connectionState === "failed") peers.delete(pc);
      });
      return pc;
    };
    Wrapped.prototype = Native.prototype;
    Object.setPrototypeOf(Wrapped, Native);
    window.RTCPeerConnection = Wrapped;

    let speaking = false;
    setInterval(async () => {
      let level = 0;
      for (const pc of peers) {
        try {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "audio" && typeof report.audioLevel === "number") {
              level = Math.max(level, report.audioLevel);
            }
          });
        } catch {
          continue;
        }
      }
      const now = level > 0.02;
      if (now !== speaking) {
        speaking = now;
        emit({ type: "rtc_audio", speaking, level });
      }
    }, 100);
  }
}
