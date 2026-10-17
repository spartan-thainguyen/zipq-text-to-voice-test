import { SEVERITY, parseSeverity } from "../severity.mjs";

export const pass = (name) => ({ name, status: "pass" });
export const skip = (name, message) => ({ name, status: "skip", message });
export const fail = (name, message, rule, data) => ({
  name,
  status: "fail",
  message,
  severity: parseSeverity(rule?.severity, SEVERITY.HIGH),
  data,
});
