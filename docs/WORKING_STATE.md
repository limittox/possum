# Possum Working State

Last updated: 2026-06-14 01:47 AEST

## Goal

Get v1 Possum running as a local-first customer simulator for AI-built apps with:

- CLI commands: `audit`, `report`, `replay`, `mcp`, `doctor`
- MCP tool surface for coding agents
- local `.possum/runs/<id>` evidence
- screenshots, traces, reports, and reproducible Playwright repros
- at least one browser-backed persona finding

## Current Pushed Baseline

Latest pushed commit before this slice:

```text
beac822 feat: capture browser screenshot evidence
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `surface.json`, `report.md`, and `findings.json` are written.
- Reachable pages get `personas/beginner/screenshots/first-page.png`.
- `surface.json` includes `personas/beginner/screenshots/first-page.png`.
- Beginner persona catches a reachable app whose first screen has no links, buttons, or forms.
- Unreachable apps produce an access finding.
- Findings write `report.md`, `trace.json`, and `repro.spec.ts`.
- `possum replay <reproPath>` executes Playwright against generated repros.
- `possum mcp` starts a stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

## Active Slice

Slice: beginner browser action trace.

Intent:

- Move the beginner persona one step closer to real customer simulation.
- Keep first-page surface extraction and screenshot behavior intact.
- Write `personas/beginner/trace.json` for reachable audits.
- Trace includes initial browser navigation, observed action counts, and a real browser click on the first customer-facing link when one exists.
- Trace records `after_click.finalUrl` after the click so coding agents can see where the customer landed.

Files changed:

```text
docs/WORKING_STATE.md
src/audit/audit.ts
src/audit/surfaceProbe.ts
tests/auditProbe.test.ts
```

TDD checkpoints:

- `npm test -- tests/auditProbe.test.ts` failed at 2026-06-14 01:31 AEST because `personas/beginner/trace.json` was not written.
- Smoke inspection caught a first implementation that recorded `click_link` but left `after_click.finalUrl` at `/`.
- The focused test now requires `after_click.finalUrl` to equal the clicked `/start` URL.

Current verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 01:45 AEST. Full test suite result: 11 files, 28 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4177
```

With a local fixture containing `<a href="/start">Start</a>`, created `run_20260613_154650`.
Generated files included:

```text
.possum/runs/run_20260613_154650/personas/beginner/screenshots/first-page.png
.possum/runs/run_20260613_154650/personas/beginner/trace.json
.possum/runs/run_20260613_154650/surface.json
.possum/runs/run_20260613_154650/report.md
```

Trace contained:

```text
persona: beginner
actions: navigate,observe_actions,click_link,after_click
after_click.finalUrl: http://127.0.0.1:4177/start
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
git add docs/WORKING_STATE.md src/audit/audit.ts src/audit/surfaceProbe.ts tests/auditProbe.test.ts
git commit -m "feat: record beginner browser trace"
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

- Add impatient persona checks, starting with double-submit forms.
- Add hostile persona checks, starting with obvious client-side validation and error-page issues.
- Add fixture apps for known findings.
- Add judge/dedupe gate beyond current deterministic findings.
- Add config run-command support and sandboxing.
