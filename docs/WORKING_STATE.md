# Possum Working State

Last updated: 2026-06-14 17:32 AEST

## Goal

Get v1 Possum running as a local-first customer simulator for AI-built apps with:

- CLI commands: `audit`, `report`, `replay`, `mcp`, `doctor`
- MCP tool surface for coding agents
- local `.possum/runs/<id>` evidence
- screenshots, traces, reports, and reproducible Playwright repros
- browser-backed persona findings
- fixture apps and benchmark corpus for known findings
- command-driven local app startup for one-shot audits

## Current Pushed Implementation

Latest pushed implementation commit:

```text
fe10509 feat: add finding judge gate
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `possum audit --command "<command>" --url <url>` starts a local app, waits for the URL, audits it, then stops the process.
- Run commands are parsed without a shell and reject shell chaining, pipes, redirection, backgrounding, command substitution, newlines, and executable paths.
- Findings pass through a local judge/dedupe gate before reports and artifacts are written.
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
- `possum mcp` starts the stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

## Completed Slice

Slice: run-command audit startup.

Session status: implementation verified, committed, and pushed to `origin/main`.

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
- After adding `runCommand` to the MCP schema and handler, the focused MCP suite passed.

Fresh verification:

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

## Completed Slice

Slice: run-command sandbox rules.

Session status: implementation verified, committed, and pushed to `origin/main`.

Intent:

- Add an inspectable validation layer before `runCommand` starts a shell process.
- Reject command strings with shell chaining, redirection, command substitution, backgrounding, newlines, or absolute executable paths.
- Keep simple local app startup commands working, including environment assignments such as `PORT=4180 npm run dev`.
- Route CLI and MCP through the same core validation by keeping the guard inside `src/audit/runCommand.ts`.
- Document the safe command shape for users and coding agents.

Files changed:

```text
README.md
docs/WORKING_STATE.md
src/cli/main.ts
src/mcp/server.ts
src/audit/runCommand.ts
tests/auditProbe.test.ts
tests/mcpHandlers.test.ts
```

TDD checkpoints:

- `npm test -- tests/auditProbe.test.ts` failed because a command with `>` ran through the shell and produced a normal startup failure instead of a sandbox rejection.
- After adding command parsing and switching startup to `spawn(executable, args, { shell: false })`, the unsafe command test passed and verified the redirected marker file was not created.
- A second regression test for a missing executable failed with an unhandled `spawn ENOENT` timeout.
- Startup errors now flow through the managed exit promise and produce an access finding containing `Run command failed to start`.
- Existing command-started audit and MCP tests were updated to use bare `node` from `PATH` while still passing absolute fixture paths as arguments.

Fresh verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 17:18 AEST. Full test suite result: 12 files, 37 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
node dist/src/cli/main.js audit --command "node -e \"console.log('unsafe')\" > /tmp/possum-sandbox-smoke.txt" --url http://127.0.0.1:9
```

Verification output showed:

```text
allowed command finding: finding_beginner_dead_end_001
port 4180 after audit: not listening
rejected command finding: Run command rejected by Possum command sandbox
unsafe marker: not created
```

Runtime artifacts were removed after smoke verification.

## Completed Slice

Slice: finding judge and dedupe gate.

Session status: implementation verified, committed, and pushed to `origin/main`.

Intent:

- Add a small, inspectable gate between persona evaluators and run artifacts.
- Accept only findings that are confirmed, reproduced, and have the required evidence pointers.
- Suppress duplicate findings with the same `dedupeFingerprint` inside a run.
- Keep discarded findings out of `findings.json`, Markdown reports, and per-finding artifact directories.
- Preserve existing deterministic persona findings that pass the gate.

Files changed:

```text
README.md
docs/WORKING_STATE.md
src/audit/audit.ts
src/audit/findingJudge.ts
tests/findingJudge.test.ts
```

TDD checkpoints:

- `npm test -- tests/findingJudge.test.ts` failed because `src/audit/findingJudge.ts` did not exist.
- Added `judgeFindings()` to accept only schema-valid, confirmed, reproduced findings with at least one replay attempt.
- Added dedupe suppression by `dedupeFingerprint`, keeping the first accepted finding and rejecting later duplicates.
- Wired `runAudit()` to pass persona findings through the judge before writing `findings.json`, Markdown reports, or per-finding artifacts.
- Existing audit behavior still passes, proving current deterministic findings pass the gate.

Fresh verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 17:24 AEST. Full test suite result: 13 files, 39 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Verification output showed:

```text
finding: finding_beginner_dead_end_001
port 4180 after audit: not listening
```

Runtime artifacts were removed after smoke verification.

## Active Slice

Slice: local claim extraction.

Session status: implementation verified; commit and push are next.

Intent:

- Add `claims` to `surface.json` as plain-file evidence from local app copy and repository README.
- Extract homepage claims from title, meta description, headings, and short paragraphs.
- Extract README claims from the audited repository root when `README.md` exists.
- Keep extraction deterministic and local; no model or cloud dependency in this slice.
- Preserve existing surface, persona, report, and finding behavior.

Files changed:

```text
docs/WORKING_STATE.md
src/contracts/surface.ts
src/audit/claimExtractor.ts
src/audit/surfaceProbe.ts
src/audit/audit.ts
tests/claimExtractor.test.ts
tests/surfaceProbe.test.ts
tests/auditProbe.test.ts
```

TDD checkpoints:

- `npm test -- tests/claimExtractor.test.ts` failed because `src/audit/claimExtractor.ts` did not exist.
- `npm test -- tests/surfaceProbe.test.ts` failed because `surface.claims` was missing from browser surface output.
- `npm test -- tests/auditProbe.test.ts` failed because `surface.json` did not include homepage or README claim sources.
- Added deterministic homepage extraction from title, meta description, headings, and short paragraphs.
- Added deterministic README extraction from H1 and non-code paragraph text in `README.md`.
- Wired `runAudit()` to pass `rootDir` into `probeTargetSurface()` so local README claims are included in `.possum/runs/<id>/surface.json`.

Fresh verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 17:32 AEST. Full test suite result: 14 files, 41 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Verification output showed:

```text
surface.json claims: homepage and readme sources present
finding: finding_beginner_dead_end_001
port 4180 after audit: not listening
```

Runtime artifacts were removed after smoke verification.

## Resume Steps

1. Inspect the worktree:

```bash
git status --short --branch
```

Expected local leftovers from prior sessions:

```text
?? .headroom/
?? AGENTS.md
```

2. Run full verification when starting another implementation slice:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

3. Smoke test the built CLI if touching audit startup behavior:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Expected finding: `finding_beginner_dead_end_001`.

4. Continue with the next v1 slice from "Remaining v1 Work After This Slice".

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

- Run a completion audit against the original v1/open-source differentiation plan.
