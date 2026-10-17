import { asArray } from "../util.mjs";
import { isChecked, isEmptyValue } from "../api/form-state.mjs";
import { fail, pass, skip } from "./result.mjs";

const normalize = (value) => String(value ?? "").replace(/[$,\s]/g, "").toLowerCase();
const isNumeric = (value) => /^-?\d+(\.\d+)?$/.test(value);

const hasLeadingZero = (value) => /^0\d/.test(value);

function same(actual, expected) {
  if (isEmptyValue(actual)) return isEmptyValue(expected);
  const a = normalize(actual);
  const b = normalize(expected);
  if (isNumeric(a) && isNumeric(b) && !hasLeadingZero(a) && !hasLeadingZero(b)) return Number(a) === Number(b);
  return a === b;
}

function resolve(values, field) {
  const keys = asArray(field);
  const present = keys.find((key) => key in values);
  return { key: present ?? keys[0], value: present ? values[present] : null };
}

function checkField(rule, values) {
  const { key, value } = resolve(values, rule.field);
  const label = `form:${key}`;
  if ("equals" in rule) {
    return same(value, rule.equals) ? pass(label) : fail(label, `expected ${JSON.stringify(rule.equals)}, got ${JSON.stringify(value)}`, rule);
  }
  if ("notEquals" in rule) {
    return same(value, rule.notEquals) ? fail(label, `must not be ${JSON.stringify(rule.notEquals)}`, rule) : pass(label);
  }
  if ("oneOf" in rule) {
    return rule.oneOf.some((option) => same(value, option))
      ? pass(label)
      : fail(label, `expected one of ${JSON.stringify(rule.oneOf)}, got ${JSON.stringify(value)}`, rule);
  }
  if ("matches" in rule) {
    return new RegExp(rule.matches, "i").test(String(value ?? ""))
      ? pass(label)
      : fail(label, `${JSON.stringify(value)} does not match /${rule.matches}/`, rule);
  }
  if ("contains" in rule) {
    return String(value ?? "").toLowerCase().includes(String(rule.contains).toLowerCase())
      ? pass(label)
      : fail(label, `${JSON.stringify(value)} does not contain ${JSON.stringify(rule.contains)}`, rule);
  }
  if (rule.empty === true) {
    return isEmptyValue(value) ? pass(label) : fail(label, `expected empty, got ${JSON.stringify(value)}`, rule);
  }
  if (rule.filled === true) {
    return isEmptyValue(value) ? fail(label, "expected a value, field is empty", rule) : pass(label);
  }
  if ("checked" in rule) {
    return isChecked(value) === Boolean(rule.checked)
      ? pass(label)
      : fail(label, `expected ${rule.checked ? "ticked" : "unticked"}, got ${JSON.stringify(value)}`, rule);
  }
  return skip(label, "rule has no comparison");
}

export function evaluateForm(rules, { values, changes }) {
  if (!values) return asArray(rules).map(() => skip("form", "form instance not located"));
  return asArray(rules).flatMap((rule) => {
    if (rule.unchanged) {
      return asArray(rule.unchanged).map((key) =>
        key in changes ? fail(`form:unchanged:${key}`, `changed ${JSON.stringify(changes[key])}`, rule) : pass(`form:unchanged:${key}`),
      );
    }
    if (rule.changedOnly) {
      const allowed = new Set(asArray(rule.changedOnly));
      const extra = Object.keys(changes).filter((key) => !allowed.has(key));
      return [extra.length ? fail("form:changedOnly", `unexpected changes: ${extra.join(", ")}`, rule, { extra }) : pass("form:changedOnly")];
    }
    if (rule.atMostOneChecked || rule.exactlyOneChecked) {
      const keys = asArray(rule.atMostOneChecked ?? rule.exactlyOneChecked);
      const ticked = keys.filter((key) => isChecked(values[key]));
      const min = rule.exactlyOneChecked ? 1 : 0;
      const name = `form:${rule.exactlyOneChecked ? "exactlyOne" : "atMostOne"}:${keys.join("|")}`;
      return [ticked.length > 1 || ticked.length < min ? fail(name, `ticked: ${ticked.join(", ") || "none"}`, rule, { ticked }) : pass(name)];
    }
    if (rule.noChanges === true) {
      const keys = Object.keys(changes);
      return [keys.length ? fail("form:noChanges", `unexpected changes: ${keys.join(", ")}`, rule, { keys }) : pass("form:noChanges")];
    }
    return [checkField(rule, values)];
  });
}
