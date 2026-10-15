// voice-test.mjs  (run: npx -y -p playwright node voice-test.mjs)
import readline from "node:readline/promises";
import { chromium } from "playwright";

const ctx = await chromium.launchPersistentContext("/tmp/pinnacle-voice-profile", {
    headless: false,
    permissions: ["microphone"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());

// inject 
await page.addInitScript(() => {
    const ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => dest.stream.clone();
    // declare a global speak function that fetches TTS audio and plays it
    window.speak = async (b64) => {
        await ac.resume();
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const buf = await ac.decodeAudioData(bytes.buffer);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(dest);
        src.start();
        return buf.duration;
    };
});

await page.goto(process.env.TARGET_URL ?? "http://localhost:5174");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("Log in, open voice mode, press the mic. Then type a line here and press Enter to speak it. Ctrl+C to quit.");

while (true) {
    const line = (await rl.question("you> ")).trim();
    if (!line) continue;
    try {
        // fetch in Node, not the page, so the site's CSP / mixed-content rules can't block it
        const r = await fetch("http://127.0.0.1:8765/tts?text=" + encodeURIComponent(line));
        if (!r.ok) throw new Error(`TTS server returned ${r.status}`);
        const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
        const secs = await page.evaluate((b) => window.speak(b), b64);
        console.log(`  speaking ~${secs.toFixed(1)}s`);
    } catch (e) {
        console.error(`  failed: ${e.message}`);
    }
}