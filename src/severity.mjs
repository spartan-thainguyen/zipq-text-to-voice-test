export const SEVERITY = Object.freeze({
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
});

const ORDER = [SEVERITY.CRITICAL, SEVERITY.HIGH, SEVERITY.MEDIUM, SEVERITY.LOW];

export const severityRank = (severity) => {
  const index = ORDER.indexOf(severity);
  return index === -1 ? ORDER.length : index;
};

export const bySeverity = (a, b) => severityRank(a.severity) - severityRank(b.severity);

export function parseSeverity(value, fallback = SEVERITY.HIGH) {
  const lowered = String(value ?? "").toLowerCase();
  return ORDER.includes(lowered) ? lowered : fallback;
}

export const CODES = Object.freeze({
  NO_REPLY: { code: "NO_REPLY", severity: SEVERITY.HIGH },
  TURN_TIMEOUT: { code: "TURN_TIMEOUT", severity: SEVERITY.HIGH },
  SLOW_FIRST_AUDIO: { code: "SLOW_FIRST_AUDIO", severity: SEVERITY.MEDIUM },
  SLOW_TURN: { code: "SLOW_TURN", severity: SEVERITY.MEDIUM },
  SLOW_TOOL: { code: "SLOW_TOOL", severity: SEVERITY.MEDIUM },
  TOOL_FAILED: { code: "TOOL_FAILED", severity: SEVERITY.HIGH },
  REPEATED_REPLY: { code: "REPEATED_REPLY", severity: SEVERITY.MEDIUM },
  STT_MISMATCH: { code: "STT_MISMATCH", severity: SEVERITY.MEDIUM },
  OBSERVABILITY_GAP: { code: "OBSERVABILITY_GAP", severity: SEVERITY.MEDIUM },
  BROWSER_PAGE_ERROR: { code: "BROWSER_PAGE_ERROR", severity: SEVERITY.HIGH },
  BROWSER_CONSOLE_ERROR: { code: "BROWSER_CONSOLE_ERROR", severity: SEVERITY.MEDIUM },
  BROWSER_CONSOLE_WARN: { code: "BROWSER_CONSOLE_WARN", severity: SEVERITY.LOW },
  HTTP_5XX: { code: "HTTP_5XX", severity: SEVERITY.HIGH },
  HTTP_4XX: { code: "HTTP_4XX", severity: SEVERITY.MEDIUM },
  REQUEST_FAILED: { code: "REQUEST_FAILED", severity: SEVERITY.MEDIUM },
  SOCKET_CLOSED: { code: "SOCKET_CLOSED", severity: SEVERITY.MEDIUM },
  ASSERTION_FAILED: { code: "ASSERTION_FAILED", severity: SEVERITY.HIGH },
  ASSERTION_SKIPPED: { code: "ASSERTION_SKIPPED", severity: SEVERITY.LOW },
  RUNNER_ERROR: { code: "RUNNER_ERROR", severity: SEVERITY.HIGH },
});
