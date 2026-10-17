import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const sayProvider = {
  name: "say",
  async synthesize(text, { voice }) {
    const dir = mkdtempSync(join(tmpdir(), "voice-test-say-"));
    const file = join(dir, "line.wav");
    try {
      const args = ["-o", file, "--data-format=LEI16@48000"];
      if (voice) args.push("-v", voice);
      args.push(text);
      await run("say", args);
      return readFileSync(file);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};
