# Possum

**Possum is the open-source local customer simulator for AI-built apps.**

It answers one question:

> Can a real customer understand and use the app your coding agent just built?

Possum runs against a local web app, reads what the app claims to do, sends
simulated customers through it in a browser, and writes reproducible evidence a
coding agent can fix.

## What It Does

- Runs locally against `localhost` with `possum audit`.
- Can start a local app for the audit with `possum audit --command "npm run dev" --url http://localhost:3000`.
- Simulates customers such as beginner, impatient, hostile, and returning users.
- Tests claim-vs-reality from README, homepage, and product copy.
- Writes plain-file evidence under `.possum/runs/<id>`.
- Produces screenshots, persona traces, findings JSON/Markdown, and Playwright
  repro scripts.
- Replays failures with `possum replay <finding>`.
- Renders existing runs with `possum report`.
- Starts a stdio MCP server with `possum mcp`.

## Coding Agent Integration

Possum is a CLI tool with a first-class MCP server. The CLI is the durable
foundation; MCP is the coding-agent integration layer.

Possum is designed to be called by coding agents such as Claude Code and Codex
after they finish a task. If the agent changes user-facing behavior and decides
the work would benefit from persona-based testing, it should automatically run a
local Possum audit, inspect the findings, and use the repro evidence as its next
repair input.

That loop should look like:

1. Coding agent implements a requested change.
2. Coding agent decides whether the change affects a customer-facing workflow.
3. If useful, it runs `possum audit` against the local app.
4. Possum writes findings, screenshots, traces, and repro scripts.
5. Coding agent fixes any relevant finding.
6. Coding agent runs `possum replay <finding>` to verify the customer failure no
   longer reproduces.

The local CLI is the baseline integration surface. An MCP server can expose the
same workflow through tools such as `run_audit`, `list_findings`, `get_finding`,
and `replay_finding` so coding agents can invoke Possum without shell-specific
glue.

## What It Is Not

Possum is not a QA dashboard, a test management platform, a self-healing test
suite, or a code-editing agent. It does not try to maximize abstract test
coverage. It tries to find the product failures a real customer would hit first.

## Open-Source Core

The local core is intended to be fully inspectable:

- browser execution
- persona prompts
- sandbox rules
- claim extraction
- finding judge
- repro generation
- report format
- fixture apps
- benchmark corpus

Hosted parallel runs, team history, model proxying, scheduled audits, managed
browsers, and private app connectors can exist as optional commercial surfaces.
The local audit path should remain usable without a Possum account.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Fixture Apps

Possum includes intentionally broken local fixture apps for known findings:

```bash
PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs
PORT=4181 node fixtures/apps/impatient-double-submit/server.mjs
PORT=4182 node fixtures/apps/hostile-server-error/server.mjs
```

Audit a running fixture with:

```bash
node dist/src/cli/main.js audit --url http://127.0.0.1:4180
```

Or let Possum start the fixture for the audit:

```bash
node dist/src/cli/main.js audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

The fixtures cover `finding_beginner_dead_end_001`, `finding_impatient_double_submit_001`, and `finding_hostile_server_error_001`.

Check local browser dependencies:

```bash
node dist/src/cli/main.js doctor
```

If Playwright reports a missing Chromium library such as `libasound.so.2`, install
it directly:

```bash
sudo apt-get update
sudo apt-get install -y libasound2
```

On newer Ubuntu releases the package may be named `libasound2t64`. To let
Playwright install Chromium's full dependency set while keeping your shell's
Node.js version under `sudo`, use:

```bash
sudo env "PATH=$PATH" npx playwright install-deps chromium
```

The first runnable slice is intentionally contract-first. `possum audit --url
http://localhost:3000` probes the target URL, writes a local
`.possum/runs/<id>` report, and stores basic page surface data in `surface.json`.
Browser execution, persona prompts, judging, and Playwright repro generation plug
into the same contracts in later slices.

## License

Possum is licensed under Apache-2.0.
