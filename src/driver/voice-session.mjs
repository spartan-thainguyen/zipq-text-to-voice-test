import readline from "node:readline/promises";
import { sleep } from "../util.mjs";

const FALLBACK_START_SELECTORS = [
  'button[aria-label*="voice" i]',
  'button[aria-label*="microphone" i]',
  'button[aria-label*="talk" i]',
];

export class VoiceSession {
  constructor({ page, env, tts, sniffer, headless }) {
    this.page = page;
    this.env = env;
    this.tts = tts;
    this.sniffer = sniffer;
    this.headless = headless;
  }

  async open() {
    this.sniffer.reset();
    await this.page.goto(this.env.ui.homeUrl ?? this.env.webUrl, { waitUntil: "domcontentloaded" });
    await this.waitForAuth();
    await this.startVoice();
  }

  async waitForAuth(timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs;
    while (!this.sniffer.hasAuth()) {
      if (Date.now() > deadline) {
        throw new Error(`No authenticated API call seen. Run "npm run login -- --env ${this.env.name}" once to sign in.`);
      }
      await sleep(500);
    }
  }

  async startVoice() {
    const steps = this.env.ui.startVoice ?? [];
    if (steps.length) {
      for (const step of steps) await this.runUiStep(step);
      return;
    }
    for (const selector of FALLBACK_START_SELECTORS) {
      const locator = this.page.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.click();
        await sleep(1500);
        return;
      }
    }
    if (this.headless) {
      throw new Error('Cannot find the voice button. Set "ui.startVoice" in config/env/<env>.json (e.g. [{"click":"<selector>"}]).');
    }
    await this.promptManual("Start voice mode in the browser window, then press Enter here");
  }

  async runUiStep(step) {
    if (step.click) await this.page.locator(step.click).first().click();
    else if (step.waitFor) await this.page.locator(step.waitFor).first().waitFor();
    else if (step.wait) await sleep(step.wait);
    else if (step.goto) await this.page.goto(step.goto);
    else throw new Error(`Unknown ui step ${JSON.stringify(step)}`);
  }

  async promptManual(message) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await rl.question(`${message}\n> `);
    rl.close();
  }

  async close() {
    await this.page.goto("about:blank").catch(() => {});
  }

  async speak(text) {
    const audio = await this.tts.synthesize(text);
    const timing = await this.page.evaluate((b64) => window.speak(b64), audio.toString("base64"));
    return { ...timing, endedAt: timing.startedAt + timing.durationMs };
  }
}
