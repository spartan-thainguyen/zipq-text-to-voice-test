export const httpProvider = {
  name: "http",
  async synthesize(text, { url, voice }) {
    if (!url) throw new Error('tts.provider "http" needs tts.url');
    const target = new URL(url);
    target.searchParams.set("text", text);
    if (voice) target.searchParams.set("voice", voice);
    const response = await fetch(target);
    if (!response.ok) throw new Error(`TTS server returned ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  },
};
