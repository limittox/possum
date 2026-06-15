# Possum

**Possum is an open-source local customer simulator for AI-built apps.**

It answers one question:

> Can a real customer understand and use the app your coding agent just built?

Possum runs against a local web app, reads what the app claims to do, sends simulated customers through it in a browser, and writes reproducible evidence a coding agent can fix.

## What It Does

- Runs locally against `localhost` with `possum audit`.
- Stores app audit settings in `possum.config.json` with `possum init`.
- Can start a local app for an audit from config or with `possum audit --command "npm run dev" --url http://localhost:3000`.
- Simulates beginner, impatient, hostile, and returning customers.
- Tests claim-vs-reality from README, homepage, and product copy.
- Writes plain-file evidence under `.possum/runs/<id>`.
- Produces screenshots, persona traces, findings JSON/Markdown, and Playwright repro scripts.
- Filters findings through the local judge/dedupe gate so reports contain confirmed, reproduced, unique failures.
- Replays generated repros with `possum replay <reproPath>`.
- Renders existing runs with `possum report`.
- Starts a stdio MCP server with `possum mcp`.

## Coding Agent Integration

Possum is a CLI tool with a first-class MCP server. The CLI is the durable baseline; MCP is the coding-agent integration layer.

Possum is designed to be called by coding agents like Claude Code and Codex after they finish a task. If an agent changes user-facing behavior and decides the work would benefit from persona-based testing, it should automatically run a local Possum audit, inspect findings, and use the repro evidence as the next repair input.

Agent setup docs:

- [Codex](docs/agents/codex.md)
- [Claude Code](docs/agents/claude-code.md)
- [Generic coding-agent prompt](docs/agents/prompt.md)

The agent loop should look like:

1. Coding agent implements the requested change.
2. Coding agent decides whether the change affects a customer-facing workflow.
3. If useful, it runs `possum audit` from a repo with `possum.config.json`.
4. Possum writes findings, reports, screenshots, traces, and repro scripts.
5. Coding agent fixes any relevant finding.
6. Coding agent runs `possum replay <reproPath>` to verify the customer failure no longer reproduces.

The MCP server exposes the same workflow through `run_audit`, `list_findings`, `get_finding`, `get_report`, and `replay_finding`, so coding agents can invoke Possum without shell-specific glue. After `possum init`, MCP `run_audit` can be called with just the repository root. Explicit MCP parameters still override config values.

## App Config

Create a starter config in the app repository:

```bash
possum init
```

This writes:

```json
{
  "target": {
    "url": "http://localhost:3000",
    "command": "npm run dev"
  }
}
```

Then run the configured audit:

```bash
possum audit
```

`target.command` is optional. If it is omitted, Possum expects the app to already be running at `target.url`.

Explicit flags override config values:

```bash
possum audit --url http://localhost:5173
possum audit --command "npm run preview" --url http://localhost:4173
```

Commands from config use the same sandbox as `--command`: no shell chaining, pipes, redirection, backgrounding, command substitution, newlines, or executable paths.

## What It Is Not

Possum is not a QA dashboard, test management platform, self-healing test suite, or code-editing agent. It does not try to maximize abstract test coverage. It tries to find product failures a real customer would hit first.

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

Hosted parallel runs, team history, model proxying, scheduled audits, managed browsers, and private app connectors can exist as optional commercial surfaces. The local audit path should remain usable without a Possum account.

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

Fixtures cover `finding_beginner_dead_end_001`, `finding_impatient_double_submit_001`, and `finding_hostile_server_error_001`.

## Run Command Sandbox

`possum audit --command` starts commands without a shell. Possum parses the command into environment assignments, a bare executable on `PATH`, and arguments.

Allowed examples:

```bash
possum audit --command "npm run dev" --url http://localhost:3000
possum audit --command "PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs" --url http://127.0.0.1:4180
```

Rejected command shapes include shell chaining, pipes, redirection, backgrounding, command substitution, newlines, and executable paths such as `/usr/bin/node` or `./node_modules/.bin/vite`. Use `npm run dev`, `npx vite`, or another bare executable instead.

## Doctor

Check local browser dependencies:

```bash
node dist/src/cli/main.js doctor
```

If Playwright reports a missing Chromium library such as `libasound.so.2`, install it directly:

```bash
sudo apt-get update
sudo apt-get install -y libasound2
```

On newer Ubuntu releases the package may be named `libasound2t64`. To let Playwright install Chromium's full dependency set while keeping your shell's Node.js version under `sudo`, use:

```bash
sudo env "PATH=$PATH" npx playwright install-deps chromium
```

## License

Possum is licensed under Apache-2.0.
