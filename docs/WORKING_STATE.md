# Possum Working State

Last updated: 2026-06-14 02:05 AEST

## Goal

Get v1 Possum running as a local-first customer simulator for AI-built apps with:

- CLI commands: `audit`, `report`, `replay`, `mcp`, `doctor`
- MCP tool surface for coding agents
- local `.possum/runs/<id>` evidence
- screenshots, traces, reports, and reproducible Playwright repros
- browser-backed persona findings

## Current Pushed Baseline

Latest pushed commit before this slice:

```text
4f58860 feat: detect impatient double submits
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `surface.json`, `report.md`, and `findings.json` are written.
- Reachable pages get `personas/beginner/screenshots/first-page.png`.
- Reachable audits write `personas/beginner/trace.json`.
- Beginner persona catches a reachable app whose first screen has no links, buttons, or forms.
- Impatient persona catches duplicate form submissions caused by rapid submit clicks.
- Unreachable apps produce an access finding.
- Findings write `report.md`, `trace.json`, and `repro.spec.ts`.
- `possum replay <reproPath>` executes Playwright against generated repros.
- `possum mcp` starts a stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

## Active Slice

Slice: hostile server-error persona.

Intent:

- Add a hostile browser-backed check for obvious validation/error-page failures.
- Navigate to the target in a fresh browser page.
- Fill the first form with an injection-shaped payload.
- Submit once and watch mutation responses.
- Report a finding when unexpected input produces HTTP 500+.

Files changed:

```text
docs/WORKING_STATE.md
src/audit/audit.ts
src/audit/hostileProbe.ts
src/personas/hostile.ts
tests/auditProbe.test.ts
```

TDD checkpoint:

- `npm test -- tests/auditProbe.test.ts` failed at 2026-06-14 02:00 AEST because only existing impatient submissions happened; no hostile payload submission or finding existed.
- The hostile probe now submits `<script>alert("possum")</script>` into the first form.
- The probe records mutation responses with HTTP status 500+ and the persona emits `finding_hostile_server_error_001`.

Current verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 02:03 AEST. Full test suite result: 11 files, 30 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4179
```

With a local fixture whose submit handler posts to `/comment` and returns HTTP 500 for encoded `<script>` payloads, created `run_20260613_160417`.
Verification output showed:

```text
server submissions: 3
findings: finding_impatient_double_submit_001,finding_hostile_server_error_001
hostile status: 500
hostile url: http://127.0.0.1:4179/comment
```

Generated files included:

```text
.possum/runs/run_20260613_160417/findings/finding_hostile_server_error_001/report.md
.possum/runs/run_20260613_160417/findings/finding_hostile_server_error_001/trace.json
.possum/runs/run_20260613_160417/findings/finding_hostile_server_error_001/repro.spec.ts
.possum/runs/run_20260613_160417/personas/hostile/trace.json
```

Runtime artifacts were removed after smoke verification.

## Resume Steps

1. Inspect worktree:

```bash
git status --short --branch
git diff --stat
```

2. If continuing without trusting the last checkpoint, rerun verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

3. If this slice is not committed yet, commit and push:

```bash
git add docs/WORKING_STATE.md src/audit/audit.ts src/audit/hostileProbe.ts src/personas/hostile.ts tests/auditProbe.test.ts
git commit -m "feat: detect hostile server errors"
git push origin main
```

## Known Environment Notes

- `rtk` is mentioned in repo instructions but is not installed in this shell.
- Playwright Chromium needs OS libraries. Check with:

```bash
node dist/src/cli/main.js doctor
```

- If `sudo npx playwright install-deps chromium` fails with syntax like `Unexpected token '?'`, root is using an older Node. Use:

```bash
sudo env "PATH=$PATH" npx playwright install-deps chromium
```

- Or install the missing library directly:

```bash
sudo apt-get update
sudo apt-get install -y libasound2
```

On newer Ubuntu, use `libasound2t64`.

## Remaining v1 Work After This Slice

- Add fixture apps for known findings.
- Add judge/dedupe gate beyond current deterministic findings.
- Add config run-command support and sandboxing.
