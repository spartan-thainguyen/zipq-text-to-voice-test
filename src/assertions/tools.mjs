import { asArray } from "../util.mjs";
import { fail, pass } from "./result.mjs";

export function evaluateTools(rules, { toolCalls }) {
  return asArray(rules).flatMap((rule) => {
    if (rule.called) {
      const re = new RegExp(rule.called, "i");
      const hit = toolCalls.some((call) => re.test(call.name ?? ""));
      return [hit ? pass(`tools:called:${rule.called}`) : fail(`tools:called:${rule.called}`, "tool was not called", rule)];
    }
    if (rule.notCalled) {
      const re = new RegExp(rule.notCalled, "i");
      const hits = toolCalls.filter((call) => re.test(call.name ?? ""));
      return [
        hits.length
          ? fail(`tools:notCalled:${rule.notCalled}`, `called ${hits.map((c) => c.name).join(", ")}`, rule)
          : pass(`tools:notCalled:${rule.notCalled}`),
      ];
    }
    if (rule.allSucceeded === true) {
      const bad = toolCalls.filter((call) => !call.ok);
      return [bad.length ? fail("tools:allSucceeded", `failed: ${bad.map((c) => c.name).join(", ")}`, rule) : pass("tools:allSucceeded")];
    }
    if (rule.maxMs != null) {
      const slow = toolCalls.filter((call) => call.durationMs != null && call.durationMs > rule.maxMs);
      return [slow.length ? fail("tools:maxMs", `slow: ${slow.map((c) => `${c.name} ${c.durationMs}ms`).join(", ")}`, rule) : pass("tools:maxMs")];
    }
    if (rule.maxCalls != null) {
      return [
        toolCalls.length > rule.maxCalls
          ? fail("tools:maxCalls", `${toolCalls.length} calls, max ${rule.maxCalls}`, rule)
          : pass("tools:maxCalls"),
      ];
    }
    return [];
  });
}
