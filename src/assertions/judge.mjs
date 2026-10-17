const API = "https://api.anthropic.com/v1/messages";

export function createJudge(config, env = process.env) {
  const key = env.ANTHROPIC_API_KEY;
  const model = env.JUDGE_MODEL ?? config.model;
  return {
    available: Boolean(config.enabled && key),
    async verdict(criterion, turn) {
      const prompt = [
        "You grade one turn of a voice assistant that fills a real-estate purchase form.",
        `User said: ${JSON.stringify(turn.userText)}`,
        `Assistant replied: ${JSON.stringify(turn.assistantText)}`,
        `Tool calls: ${JSON.stringify(turn.toolCalls.map((c) => ({ name: c.name, ok: c.ok })))}`,
        `Form fields changed this turn: ${JSON.stringify(turn.changes ?? {})}`,
        `Criterion: ${criterion}`,
        'Answer with JSON only: {"pass": true|false, "reason": "<one sentence>"}',
      ].join("\n");
      const response = await fetch(API, {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new Error(`judge HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = await response.json();
      const text = body.content?.map((part) => part.text ?? "").join("") ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("judge returned no JSON");
      return JSON.parse(match[0]);
    },
  };
}
