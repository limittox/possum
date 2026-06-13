# Possum Working State

Last updated: 2026-06-14 01:56 AEST

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
34b0aaf feat: record beginner browser trace
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `surface.json`, `report.md`, and `findings.json` are written.
- Reachable pages get `personas/beginner/screenshots/first-page.png`.
- Reachable audits write `personas/beginner/trace.json`.
- Beginner persona catches a reachable app whose first screen has no links, buttons, or forms.
- Unreachable apps produce an access finding.
- Findings write `report.md`, `trace.json`, and `repro.spec.ts`.
- `possum replay <reproPath>` executes Playwright against generated repros.
- `possum mcp` starts a stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

## Active Slice

Slice: impatient double-submit persona.

Intent:

- Add an impatient browser-backed check for forms.
- Navigate to the target in a fresh browser page.
- Fill the first form with safe dummy values.
- Rapidly double-click the first submit control.
- Count native form submissions and mutation requests triggered by JavaScript submit handlers.
- Report a finding when the rapid submit causes duplicate customer submissions.

Files changed:

```text
docs/WORKING_STATE.md
src/audit/audit.ts
src/audit/impatientProbe.ts
src/personas/impatient.ts
tests/auditProbe.test.ts
```

TDD checkpoint:

- `npm test -- tests/auditProbe.test.ts` failed at 2026-06-14 01:52 AEST because the audit did not submit the form at all.
- First implementation clicked the form but counted only the static form action; JS-handled forms posted elsewhere.
- The probe now counts both native form requests and mutation requests caused by the rapid submit.

Current verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 01:55 AEST. Full test suite result: 11 files, 29 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4178
```

With a local fixture whose submit handler runs `fetch('/signup', { method: 'POST' })`, created `run_20260613_155607`.
Verification output showed:

```text
server submissions: 2
finding: finding_impatient_double_submit_001
trace double_submit.submissionCount: 2
trace submittedUrls: http://127.0.0.1:4178/signup,http://127.0.0.1:4178/signup
```

Generated files included:

```text
.possum/runs/run_20260613_155607/findings/finding_impatient_double_submit_001/report.md
.possum/runs/run_20260613_155607/findings/finding_impatient_double_submit_001/trace.json
.possum/runs/run_20260613_155607/findings/finding_impatient_double_submit_001/repro.spec.ts
.possum/runs/run_20260613_155607/personas/impatient/trace.json
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
git add docs/WORKING_STATE.md src/audit/audit.ts src/audit/impatientProbe.ts src/personas/impatient.ts tests/auditProbe.test.ts
git commit -m "feat: detect impatient double submits"
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

- Add hostile persona checks, starting with obvious client-side validation and error-page issues.
- Add fixture apps for known findings.
- Add judge/dedupe gate beyond current deterministic findings.
- Add config run-command support and sandboxing.
