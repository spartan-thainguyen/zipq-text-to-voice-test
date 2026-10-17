import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { launchBrowser } from "./driver/browser.mjs";
import { listEnvironments, loadDotEnv, loadEnvironment, PATHS } from "./config.mjs";
import { writeReport } from "./report/index.mjs";
import { runSuite } from "./run.mjs";
import { listSuites, loadSuite } from "./suite.mjs";

loadDotEnv();

const OPTIONS = {
  env: { type: "string", default: process.env.TARGET_ENV ?? "dev" },
  suite: { type: "string", default: "rpa-hard" },
  only: { type: "string" },
  repeat: { type: "string" },
  headless: { type: "boolean" },
  "keep-raw": { type: "boolean", default: false },
  "allow-prod": { type: "boolean", default: false },
};

const USAGE = `usage: node src/cli.mjs <command> [options]

  run      run a suite     --env dev --suite rpa-hard [--only H1,H2] [--repeat 3] [--headless] [--keep-raw]
  login    sign in once and keep the browser profile for --env
  report   rebuild the report for a run   report <run-id|latest>
  list     show environments, suites and runs
`;

async function login(envName) {
  const env = loadEnvironment(envName);
  const browser = await launchBrowser(env, { headless: false });
  await browser.page.goto(env.webUrl);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`Sign in to ${env.webUrl} in the browser window, then press Enter here.\n> `);
  rl.close();
  await browser.close();
  console.log(`Profile saved in ${env.profileDir}`);
}

function list() {
  console.log(`environments: ${listEnvironments().join(", ")}`);
  for (const name of listSuites()) {
    const suite = loadSuite(name);
    console.log(`suite ${name}: ${suite.scripts.map((s) => s.id).join(" ")}`);
  }
  if (existsSync(PATHS.resultsDir)) {
    const runs = readdirSync(PATHS.resultsDir).filter((d) => d !== "latest").sort().slice(-10);
    console.log(`recent runs:\n  ${runs.join("\n  ")}`);
  }
}

async function main() {
  const { positionals, values } = parseArgs({ options: OPTIONS, allowPositionals: true });
  const [command, arg] = positionals;

  if (command === "run") {
    const recorder = await runSuite({
      envName: values.env,
      suiteName: values.suite,
      only: values.only?.split(",").map((s) => s.trim()).filter(Boolean),
      repeat: values.repeat ? Number(values.repeat) : undefined,
      headless: values.headless,
      keepRaw: values["keep-raw"],
      allowReadOnlyEnv: values["allow-prod"],
    });
    const worst = recorder.findings.some((f) => f.severity === "critical" || f.severity === "high");
    process.exitCode = worst ? 1 : 0;
  } else if (command === "login") {
    await login(values.env);
  } else if (command === "report") {
    const dir = join(PATHS.resultsDir, arg ?? "latest");
    const report = writeReport(dir);
    console.log(`${report.markdownPath}\n${report.headline}`);
  } else if (command === "list") {
    list();
  } else {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
