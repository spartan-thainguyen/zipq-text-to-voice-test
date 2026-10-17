import { asArray } from "../util.mjs";
import { fail, pass, skip } from "./result.mjs";

const STOPWORDS = new Set("the a an and or to of in on is are was be i you it that this for with as at by your my we have has not no yes".split(" "));
const words = (text) => text.toLowerCase().match(/[a-z']+/g) ?? [];

function looksEnglish(text) {
  const tokens = words(text);
  if (tokens.length < 6) return true;
  const hits = tokens.filter((token) => STOPWORDS.has(token)).length;
  const nonLatin = (text.match(/[^\u0000-ɏ\s\p{P}\p{S}\p{N}]/gu) ?? []).length;
  return hits / tokens.length >= 0.12 && nonLatin === 0;
}

export async function evaluateReply(rules, turn, judge) {
  const text = turn.assistantText ?? "";
  const results = [];
  for (const rule of asArray(rules)) {
    if (rule.matches) {
      results.push(new RegExp(rule.matches, "i").test(text) ? pass(`reply:matches:${rule.matches}`) : fail(`reply:matches:${rule.matches}`, `reply: ${JSON.stringify(text)}`, rule));
    } else if (rule.notMatches) {
      results.push(new RegExp(rule.notMatches, "i").test(text) ? fail(`reply:notMatches:${rule.notMatches}`, `reply: ${JSON.stringify(text)}`, rule) : pass(`reply:notMatches:${rule.notMatches}`));
    } else if (rule.english === true) {
      results.push(looksEnglish(text) ? pass("reply:english") : fail("reply:english", `reply: ${JSON.stringify(text)}`, rule));
    } else if (rule.maxQuestions != null) {
      const count = (text.match(/\?/g) ?? []).length;
      results.push(count > rule.maxQuestions ? fail("reply:maxQuestions", `${count} questions`, rule) : pass("reply:maxQuestions"));
    } else if (rule.nonEmpty === true) {
      results.push(text.trim() ? pass("reply:nonEmpty") : fail("reply:nonEmpty", "assistant said nothing", rule));
    } else if (rule.judge) {
      if (!judge.available) {
        results.push(skip(`reply:judge:${rule.judge.slice(0, 40)}`, "judge unavailable (set ANTHROPIC_API_KEY)"));
        continue;
      }
      try {
        const verdict = await judge.verdict(rule.judge, turn);
        results.push(verdict.pass ? pass(`reply:judge:${rule.judge.slice(0, 40)}`) : fail(`reply:judge:${rule.judge.slice(0, 40)}`, verdict.reason, rule));
      } catch (error) {
        results.push(skip(`reply:judge:${rule.judge.slice(0, 40)}`, error.message));
      }
    }
  }
  return results;
}
