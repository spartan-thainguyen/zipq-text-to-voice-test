# voice-test

Drives the Pinnacle web app by voice (a fake microphone fed by text-to-speech), runs scripted
conversations against Sofia, and records what happened on both sides of the call.

## Quick start

```bash
make install
make login ENV=dev                 # once per environment: sign in, close the window
make suite ENV=dev ONLY=H2         # run one script, 3 repeats
make suite ENV=dev HEADLESS=1      # whole suite, no window
make report                        # rebuild results/latest/summary.md
```

`make dev|local|prod` still opens the interactive tool (type a line, hear it spoken).

## What is recorded

Everything lands in `results/<run-id>/` (`results/latest` links to the newest):

| File | Content |
|---|---|
| `summary.md`, `summary.json` | pass table, findings by severity, latency p50/p95, per-tool timing, every turn |
| `turns.jsonl` | one record per spoken line: heard text, reply, tool calls with duration, form changes, metrics, assertions |
| `findings.jsonl` | every problem, with `severity` (critical, high, medium, low), `code`, `source`, script, repeat and step |
| `events.jsonl` | the two above plus API calls and websocket events, in order |
| `raw/` | raw thread and form payloads when run with `KEEP_RAW=1` |

Per turn: speech length, speech end to first bot audio, total turn time, bot speaking time, tool count and time.
Tool durations come from the backend (`startedAt`/`completedAt`), so they are not affected by clock skew.
Bot audio is detected in the page (WebRTC inbound level, or Web Audio playback).

Severity rules live in `src/severity.mjs`: a wrong or invented value is whatever the script marks `critical`;
failed assertions and failed tools default to high; slow turns, STT mismatches and console errors are medium; warnings are low.
A turn whose checks were skipped (form not found, no judge key) is `partial`, never `pass`.

## Secrets

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored and loaded on every `make` command;
variables already set in your shell win over the file. Only `ANTHROPIC_API_KEY` (for `judge:` checks) is needed today.

## Environments

`config/env/<name>.json` over `config/defaults.json`; override with `WEB_URL`, `API_URL`, `ORG_ID`.
Add an environment by adding a file. `prod` is read-only and needs `ALLOW_PROD=1`.
If voice mode cannot be started by the built-in selectors, set `ui.startVoice` in the environment file,
for example `[{"click": "<selector>"}, {"wait": 1500}]`.

## Suites

`suites/<name>/suite.yaml` holds the shared setup (target document, the line that creates a fresh transaction,
default checks). Every other `*.yaml` in the folder is one script. A step is:

```yaml
- id: H4.1
  say: "..."
  expect:
    form:   # field values read back from the API
      - { field: offer.brokerage.sellers.agent.lic, equals: "01955738", severity: critical }
      - { noChanges: true }
      - { atMostOneChecked: [offer.coe.days_check, offer.coe.on_date_check] }
    tools:  # tool calls of this turn
      - { notCalled: "send|sign" }
      - { allSucceeded: true }
    reply:  # what Sofia said
      - { matches: "Harbor Title" }
      - { judge: "plain-language criterion" }   # needs ANTHROPIC_API_KEY
```

`{{year}}` and `{{today_iso}}` are filled in when the suite loads.

## Layout

```
src/driver/      browser, fake microphone, voice session
src/probes/      bot audio detection
src/collectors/  browser console/network errors, session sniffing
src/api/         API client, response adapters (all backend shape knowledge), form state
src/assertions/  form / tools / reply checks, LLM judge
src/tts/         speech providers (say, http)
src/report/      summary and markdown
```

Backend response shapes are read only in `src/api/adapters.mjs`; fix a shape there and nothing else changes.
New text-to-speech engine: add a provider in `src/tts/` and register it in `src/tts/index.mjs`.
