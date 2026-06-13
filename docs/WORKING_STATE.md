# Possum Working State

Last updated: 2026-06-14 01:26 AEST

## Goal

Get v1 Possum running as a local-first customer simulator for AI-built apps with:

- CLI commands: `audit`, `report`, `replay`, `mcp`, `doctor`
- MCP tool surface for coding agents
- local `.possum/runs/<id>` evidence
- reproducible Playwright repros
- at least one real browser-backed persona finding

## Current Pushed Baseline

Latest pushed commit:

```text
8f267a9 feat: add Playwright dependency doctor
```

Current pushed behavior:

- `possum audit --url <url>` probes a target app and writes `.possum/runs/<id>`.
- `surface.json`, `report.md`, and `findings.json` are written.
- Beginner persona catches a reachable app whose first screen has no links, buttons, or forms.
- Unreachable apps produce an access finding.
- Findings write `report.md`, `trace.json`, and `repro.spec.ts`.
- `possum replay <reproPath>` executes Playwright against generated repros.
- `possum mcp` starts a stdio MCP server.
- `possum doctor` checks Playwright system dependency readiness and prints install guidance.

Last verified pushed baseline:

```bash
npm test
npm run typecheck
npm run build
node dist/src/cli/main.js doctor
```

Also verified manually after installing `libasound.so.2`:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4175
node dist/src/cli/main.js replay .possum/runs/*/findings/finding_beginner_dead_end_001/repro.spec.ts
```

The generated Playwright repro passed.

## Implemented Slice

Slice: browser-backed audit screenshots.

Intent:

- Replace HTTP-only surface probing with Playwright page rendering.
- Capture `personas/beginner/screenshots/first-page.png` for reachable pages.
- Store the screenshot path in `surface.json`.
- Include the screenshot path in beginner finding evidence.
- Keep Playwright packages as runtime dependencies because audit probing launches a browser and generated repros import Playwright test APIs.

Files in this slice:

```text
docs/WORKING_STATE.md
package.json
package-lock.json
src/audit/audit.ts
src/audit/surfaceProbe.ts
src/contracts/surface.ts
src/personas/beginner.ts
tests/auditProbe.test.ts
```

Expected new behavior:

- `runAudit()` writes `.possum/runs/<id>/personas/beginner/screenshots/first-page.png`.
- PNG file starts with the standard PNG signature.
- `surface.json` includes:

```json
"screenshot": "personas/beginner/screenshots/first-page.png"
```

- `finding_beginner_dead_end_001.evidence.screenshots` includes the same relative path.

Current verification:

```bash
npm test -- tests/auditProbe.test.ts
```

Passed 4 tests at 2026-06-14 01:21 AEST.

Full verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Passed at 2026-06-14 01:26 AEST. Full test suite result: 11 files, 27 tests.

Smoke verification:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4176
```

Created `run_20260613_152503` and wrote `personas/beginner/screenshots/first-page.png`.
PNG signature check returned `137,80,78,71`, and `surface.json` contained `personas/beginner/screenshots/first-page.png`.

`npm install` completed after moving Playwright packages to dependencies. It reported 5 audit vulnerabilities; they have not been addressed in this slice.

## Resume Steps

1. Inspect worktree:

```bash
git status --short --branch
git diff --stat
```

2. If continuing without trusting the last checkpoint, rerun full verification:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

3. If continuing without trusting the last checkpoint, rerun the smoke test with a local fixture:

```bash
node -e "const http=require('http'); const html='<!doctype html><title>Screenshot Fixture</title><h1>Welcome</h1>'; const server=http.createServer((_req,res)=>{res.writeHead(200, {'content-type':'text/html'}); res.end(html);}); server.listen(4176, '127.0.0.1', () => console.log('screenshot fixture ready')); setInterval(()=>{}, 1000);"
```

In another shell while the fixture is running:

```bash
rm -rf .possum test-results
node dist/src/cli/main.js audit --url http://127.0.0.1:4176
find .possum -maxdepth 6 -type f | sort
```

Expected files include:

```text
.possum/runs/<id>/personas/beginner/screenshots/first-page.png
.possum/runs/<id>/surface.json
.possum/runs/<id>/findings/finding_beginner_dead_end_001/repro.spec.ts
```

4. Stop fixture server and remove generated runtime artifacts:

```bash
rm -rf .possum test-results
```

5. If this slice is not committed yet, commit and push:

```bash
git add docs/WORKING_STATE.md package.json package-lock.json src/audit/audit.ts src/audit/surfaceProbe.ts src/contracts/surface.ts src/personas/beginner.ts tests/auditProbe.test.ts
git commit -m "feat: capture browser screenshot evidence"
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

- Replace heuristic-only beginner behavior with a small Playwright action trace.
- Add impatient persona checks, starting with double-submit forms.
- Add hostile persona checks, starting with obvious client-side validation and error-page issues.
- Add fixture apps for known findings.
- Add judge/dedupe gate beyond current deterministic findings.
- Add config run-command support and sandboxing.
