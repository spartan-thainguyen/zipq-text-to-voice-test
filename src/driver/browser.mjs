import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { installPageHooks } from "./init-script.mjs";

export async function launchBrowser(env, { headless }) {
  mkdirSync(env.profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(env.profileDir, {
    headless,
    permissions: ["microphone"],
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"],
  });
  await context.addInitScript(installPageHooks);
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page, close: () => context.close() };
}
