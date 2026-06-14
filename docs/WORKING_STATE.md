# Possum Working State

Last updated: 2026-06-14 17:02 AEST

## Goal

Get v1 Possum running as a local-first customer simulator for AI-built apps with:

- CLI commands: `audit`, `report`, `replay`, `mcp`, `doctor`
- MCP tool surface for coding agents
- local `.possum/runs/<id>` evidence
- screenshots, traces, reports, and reproducible Playwright repros
- browser-backed persona findings
- fixture apps and benchmark corpus for known findings
- command-driven local app startup for one-shot audits

## Current Pushed Baseline

Latest pushed commit before this slice:

```text
0b1bb36 feat: add known finding fixture apps
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `surface.json`, `report.md`, and `findings.json` are written.
- Reachable pages get `personas/beginner/screenshots/first-page.png` when screenshot capture succeeds.
- Reachable audits write persona traces for beginner, impatient, and hostile checks.
- Beginner persona catches a reachable app whose first screen has no links, buttons, or forms.
- Impatient persona catches duplicate form submissions caused by rapid submit clicks.
- Hostile persona catches mutation responses that produce HTTP 500+ for unexpected input.
- Fixture apps reproduce the current known findings.
- Unreachable apps produce an access finding.
- Findings write `report.md`, `trace.json`, and `repro.spec.ts`.
- `possum replay <reproPath>` executes Playwright against generated repros.
- `possum mcp` starts a stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

## Active Slice

Slice: run-command audit startup.

Session status: implementation reviewed; fresh verification passed; staging, commit, and push are next.

Intent:

- Add `runCommand` support to the audit core.
- Add CLI support: `possum audit --command "<command>" --url <url>`.
- Add MCP support: `run_audit` accepts `runCommand`.
- Start the command in the repository root, wait until the target URL responds, run the audit, then stop the process group.
- Keep generated findings and reports unchanged for command-started targets.

Files changed:

```text
README.md
docs/WORKING_STATE.md
fixtures/apps/README.md
src/audit/audit.ts
src/audit/runCommand.ts
src/cli/main.ts
src/mcp/server.ts
tests/auditProbe.test.ts
tests/mcpHandlers.test.ts
```

TDD checkpoints:

- `npm test -- tests/auditProbe.test.ts` failed because `runAudit` ignored `runCommand` and produced `finding_beginner_access_001`.
- After wiring the core helper, `tests/auditProbe.test.ts` passed and verified the started fixture process becomes unreachable after audit cleanup.
- `npm test -- tests/mcpHandlers.test.ts` initially passed too weakly because an access finding also had count 1; the test now asserts `finding_beginner_dead_end_001` from a command-started fixture.
- After adding `runCommand` to the MCP schema/handler, the focused MCP suite passed.

Current verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 17:02 AEST. Full test suite result: 12 files, 35 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Created `run_20260614_070233`.
Verification output showed:

```text
finding: finding_beginner_dead_end_001
port 4180 after audit: not listening
```

Runtime artifacts were removed after smoke verification.

## Resume Steps

1. Inspect worktree:

```bash
git status --short --branch
git diff --stat
```

2. Run full verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

3. Smoke test the built CLI:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Expected finding: `finding_beginner_dead_end_001`.

4. If this slice is not committed yet, commit and push:

```bash
git add README.md docs/WORKING_STATE.md fixtures/apps/README.md src/audit/audit.ts src/audit/runCommand.ts src/cli/main.ts src/mcp/server.ts tests/auditProbe.test.ts tests/mcpHandlers.test.ts
git commit -m "feat: start app command for audits"
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
- Add sandbox restrictions around run-command execution.
