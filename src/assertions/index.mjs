import { asArray } from "../util.mjs";
import { evaluateForm } from "./form.mjs";
import { evaluateReply } from "./reply.mjs";
import { skip } from "./result.mjs";
import { evaluateTools } from "./tools.mjs";

export function evaluateImmediate(expect = {}, turn) {
  const results = [];
  if (expect.form) results.push(...evaluateForm(expect.form, { values: turn.values, changes: turn.changes ?? {} }));
  return results;
}

export function evaluateToolRules(expect = {}, turn) {
  return expect.tools ? evaluateTools(expect.tools, turn) : [];
}

export function evaluateReplyRules(expect = {}, turn, judge) {
  return evaluateReply(expect.reply, turn, judge);
}

export function skipReplyRules(expect = {}, message) {
  return asArray(expect.reply).map((rule) => skip(`reply:${Object.keys(rule)[0]}`, message));
}
