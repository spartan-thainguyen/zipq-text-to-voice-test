import { execSync } from "node:child_process";
import { createJudge } from "./assertions/judge.mjs";
import { ApiClient } from "./api/client.mjs";
import { FormWatcher } from "./api/form-state.mjs";
import { attachBrowserCollector } from "./collectors/browser-events.mjs";
import { SessionSniffer } from "./collectors/session-sniffer.mjs";
import { loadEnvironment } from "./config.mjs";
import { ConversationReader } from "./conversation.mjs";
import { launchBrowser } from "./driver/browser.mjs";
import { VoiceSession } from "./driver/voice-session.mjs";
import { BotAudioProbe } from "./probes/bot-audio.mjs";
import { Recorder } from "./recorder.mjs";
import { ReplyResolver } from "./reply-resolver.mjs";
import { writeReport } from "./report/index.mjs";
import { CODES } from "./severity.mjs";
import { loadSuite } from "./suite.mjs";
import { createTts } from "./tts/index.mjs";
import { runTurn } from "./turn.mjs";
import { sleep } from "./util.mjs";

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

async function runStepAction(page, action) {
  if (action.wait) await sleep(action.wait);
  else if (action.click) await page.locator(action.click).first().click();
  else throw new Error(`Unknown action ${JSON.stringify(action)}`);
}

export async function runSuite(options) {
  const env = loadEnvironment(options.envName);
  if (env.readOnly && !options.allowReadOnlyEnv) {
    throw new Error(`Environment "${env.name}" is marked read-only. Pass --allow-prod to run anyway.`);
  }
  const suite = loadSuite(options.suiteName, { only: options.only });
  const repeat = options.repeat ?? suite.repeat ?? env.repeat;
  const headless = options.headless ?? env.headless;
  const recorder = new Recorder({
    envName: env.name,
    suiteName: suite.name,
    meta: { env: env.name, webUrl: env.webUrl, apiUrl: env.apiUrl, suite: suite.name, repeat, git: gitSha(), scripts: suite.scripts.map((s) => s.id) },
  });
  console.log(`run ${recorder.runId}\n  results: ${recorder.dir}`);

  const browser = await launchBrowser(env, { headless });
  const sniffer = new SessionSniffer(browser.page, env);
  attachBrowserCollector(browser.page, env, recorder);
  const probe = new BotAudioProbe(browser.page);
  probe.start();

  const api = new ApiClient(env, sniffer, { onCall: (call) => recorder.event("api_call", call) });
  const reader = new ConversationReader(api, sniffer, recorder);
  const session = new VoiceSession({ page: browser.page, env, tts: createTts(env.tts), sniffer, headless });
  const judge = createJudge(env.judge);

  try {
    for (const script of suite.scripts) {
      for (let attempt = 1; attempt <= repeat; attempt++) {
        recorder.setContext({ script: script.id, repeat: attempt });
        console.log(`\n== ${script.id} ${script.title ?? ""} (run ${attempt}/${repeat})`);
        await runScript({ script, attempt, env, session, probe, api, reader, recorder, judge, sniffer, page: browser.page, keepRaw: options.keepRaw, document: suite.document });
      }
    }
  } finally {
    recorder.setContext({});
    await probe.stop();
    await browser.close();
    recorder.finish({ audioSources: probe.sources(), judgeAvailable: judge.available });
    const report = writeReport(recorder.dir);
    console.log(`\nreport: ${report.markdownPath}`);
    console.log(report.headline);
  }
  return recorder;
}

async function runScript(ctx) {
  const { script, attempt, env, session, probe, api, reader, recorder, judge, sniffer, page, keepRaw, document } = ctx;
  reader.reset();
  const form = new FormWatcher(api, document);
  try {
    await session.open();
  } catch (error) {
    recorder.finding({ ...CODES.RUNNER_ERROR, message: `could not open voice session: ${error.message}` });
    return;
  }
  const state = { knownTransactions: await form.listTransactionIds().catch(() => new Set()) };
  const resolver = new ReplyResolver({ reader, recorder, judge, thresholds: env.thresholds, log: (step, status) => console.log(`    ${step} reply checked: ${status}`) });
  const turnCtx = { env, session, probe, form, reader, recorder, resolver, state, sniffer };

  for (const step of script.steps) {
    recorder.mergeContext({ step: step.id });
    process.stdout.write(`  ${step.id} ${step.say ? JSON.stringify(step.say.slice(0, 70)) : JSON.stringify(step.action)} ... `);
    try {
      if (step.action) {
        await runStepAction(page, step.action);
        console.log("done");
        continue;
      }
      const { metrics, raw } = await runTurn(turnCtx, step);
      console.log(`${metrics.settle} (${metrics.firstAudioMs ?? "-"}ms first audio, ${metrics.turnTotalMs}ms turn, ${metrics.toolCount} tools)`);
      if (keepRaw) recorder.raw(`${script.id}_${attempt}_${step.id}`, raw);
    } catch (error) {
      recorder.finding({ ...CODES.RUNNER_ERROR, message: `${step.id}: ${error.message}`, data: { stack: error.stack } });
      console.log(`runner error: ${error.message}`);
    }
  }
  recorder.mergeContext({ step: null });
  await session.close();
  await resolver.flush(env.timing.replyGraceMs, env.timing.pollIntervalMs);
  if (keepRaw && reader.lastRaw) recorder.raw(`${script.id}_${attempt}_final-thread`, reader.lastRaw);
}
