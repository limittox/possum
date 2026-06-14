# Possum Working State

Last updated: 2026-06-14 16:46 AEST

## Goal

Get v1 Possum running as a local-first customer simulator for AI-built apps with:

- CLI commands: `audit`, `report`, `replay`, `mcp`, `doctor`
- MCP tool surface for coding agents
- local `.possum/runs/<id>` evidence
- screenshots, traces, reports, and reproducible Playwright repros
- browser-backed persona findings
- fixture apps and benchmark corpus for known findings

## Current Pushed Baseline

Latest pushed commit before this slice:

```text
0f90ab0 feat: detect hostile server errors
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `surface.json`, `report.md`, and `findings.json` are written.
- Reachable pages get `personas/beginner/screenshots/first-page.png`.
- Reachable audits write persona traces for beginner, impatient, and hostile checks.
- Beginner persona catches a reachable app whose first screen has no links, buttons, or forms.
- Impatient persona catches duplicate form submissions caused by rapid submit clicks.
- Hostile persona catches mutation responses that produce HTTP 500+ for unexpected input.
- Unreachable apps produce an access finding.
- Findings write `report.md`, `trace.json`, and `repro.spec.ts`.
- `possum replay <reproPath>` executes Playwright against generated repros.
- `possum mcp` starts a stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

## Active Slice

Slice: fixture apps for known findings.

Intent:

- Add checked-in, intentionally broken local fixture apps for the current known findings.
- Make each fixture runnable directly with `node fixtures/apps/<name>/server.mjs`.
- Make each fixture importable from tests through `createFixtureServer()`.
- Include fixtures in the npm package file list so the open-source distribution contains them.
- Document fixture usage in README and `fixtures/apps/README.md`.

Files changed:

```text
README.md
docs/WORKING_STATE.md
fixtures/apps/README.md
fixtures/apps/beginner-dead-end/server.mjs
fixtures/apps/hostile-server-error/server.mjs
fixtures/apps/impatient-double-submit/server.mjs
package.json
tests/fixtureApps.test.ts
tests/surfaceProbe.test.ts
```

TDD checkpoint:

- `npm test -- tests/fixtureApps.test.ts` failed because the fixture server modules did not exist.
- After adding fixtures, the focused fixture suite proved each fixture reproduces its intended finding:
  - `finding_beginner_dead_end_001`
  - `finding_impatient_double_submit_001`
  - `finding_hostile_server_error_001`
- A full-suite rerun exposed that optional screenshot capture could throw and become a false access finding.
- `probeTargetSurface` now treats screenshot capture as best-effort and omits `surface.screenshot` when capture fails.

Current verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 16:46 AEST. Full test suite result: 12 files, 34 tests.

Smoke verification:

```bash
PORT=4181 node fixtures/apps/impatient-double-submit/server.mjs
node dist/src/cli/main.js audit --url http://127.0.0.1:4181
```

Created `run_20260614_064013`.
Verification output showed:

```text
fixture POST count: 3
finding: finding_impatient_double_submit_001
```

The count is 3 because the hostile persona also submits the fixture form once after the impatient double-click. The fixture still reproduces the intended impatient finding.

Generated files included:

```text
.possum/runs/run_20260614_064013/findings/finding_impatient_double_submit_001/report.md
.possum/runs/run_20260614_064013/findings/finding_impatient_double_submit_001/trace.json
.possum/runs/run_20260614_064013/findings/finding_impatient_double_submit_001/repro.spec.ts
.possum/runs/run_20260614_064013/personas/impatient/trace.json
```

Runtime artifacts were removed after smoke verification.

## Resume Steps

1. Inspect worktree:

```bash
git status --short --branch
git diff --stat
```

2. Rerun verification because this document changed after the last full check:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

3. If this slice is not committed yet, commit and push:

```bash
git add README.md docs/WORKING_STATE.md fixtures/apps package.json src/audit/surfaceProbe.ts tests/fixtureApps.test.ts tests/surfaceProbe.test.ts
git commit -m "feat: add known finding fixture apps"
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

- Add judge/dedupe gate beyond current deterministic findings.
- Add config run-command support and sandboxing.
