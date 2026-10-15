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
    window.speak = async (text) => {
        await ac.resume();
        const r = await fetch("http://127.0.0.1:8765/tts?text=" + encodeURIComponent(text));
        const buf = await ac.decodeAudioData(await r.arrayBuffer());
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.connect(dest);
        src.start();
        return buf.duration;
    };
});

await page.goto("http://localhost:5174");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("Log in, open voice mode, press the mic. Then type a line here and press Enter to speak it. Ctrl+C to quit.");

while (true) {
    const line = (await rl.question("you> ")).trim();
    if (!line) continue;
    const secs = await page.evaluate((t) => window.speak(t), line);
    console.log(`  speaking ~${secs.toFixed(1)}s`);
}