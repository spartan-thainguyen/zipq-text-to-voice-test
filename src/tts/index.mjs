import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PATHS } from "../config.mjs";
import { hash } from "../util.mjs";
import { httpProvider } from "./http.mjs";
import { sayProvider } from "./say.mjs";

const PROVIDERS = Object.fromEntries([sayProvider, httpProvider].map((p) => [p.name, p]));

export function createTts(config) {
  const provider = PROVIDERS[config.provider];
  if (!provider) {
    throw new Error(`Unknown tts.provider "${config.provider}". Available: ${Object.keys(PROVIDERS).join(", ")}`);
  }
  const cacheDir = join(PATHS.cacheDir, "tts");
  mkdirSync(cacheDir, { recursive: true });

  return {
    async synthesize(text) {
      const file = join(cacheDir, `${hash(`${provider.name}|${config.voice ?? ""}|${text}`)}.wav`);
      if (existsSync(file)) return readFileSync(file);
      const audio = await provider.synthesize(text, config);
      writeFileSync(file, audio);
      return audio;
    },
  };
}
