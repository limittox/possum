# Possum

**Possum is an open-source local customer simulator for AI-built apps.**

It answers one question:

> Can a real customer understand and use the app your coding agent just built?

Possum runs against a local web app, reads what the app claims to do, sends simulated customers through it in a browser, and writes reproducible evidence a coding agent can fix.

## What It Does

- Runs locally against `localhost` with `possum verify-app` or `possum audit`.
- Verifies completed features with `possum verify-feature --brief feature.json`.
- Infers feature checks from git changes and verifies them with `possum verify-diff`.
- Records login state with `possum auth record` for authenticated verification.
- Stores app verification settings in `possum.config.json` with `possum init`.
- Can start a local app for verification from config or with `possum verify-app --command "npm run dev" --url http://localhost:3000`.
- Simulates beginner, impatient, hostile, keyboard-only, and returning customers.
- Checks keyboard accessibility basics such as tab reachability, accessible names, and focusable custom controls.
- Tests claim-vs-reality from README, homepage, and product copy (opt-in, when a model is configured).
- Writes plain-file evidence under `.possum/runs/<id>`.
- Produces Markdown and browser-viewable HTML run reports (`report.md`, `report.html`).
- Produces screenshots, persona traces, keyboard accessibility traces, findings JSON/Markdown, Playwright repro scripts, `debug.json`, and `repair-hints.md` debugging bundles.
- Filters findings through the local judge/dedupe gate so reports contain confirmed, reproduced, unique failures.
- Replays generated repros with `possum replay <reproPath>`.
- Renders existing runs with `possum report`.
- Starts a stdio MCP server with `possum mcp`.

## Coding Agent Integration

Possum is CLI-first with a first-class MCP server. The CLI is the durable baseline; MCP is the coding-agent integration layer.

Possum is designed to be called by coding agents such as Claude Code or Codex after they finish a task. If an agent changes user-facing behavior, it should run the Possum command that matches its intent, inspect any findings, and use repro evidence as the next repair input.

Agent setup docs:

- [Codex](docs/agents/codex.md)
- [Claude Code](docs/agents/claude-code.md)
- [Generic coding-agent prompt](docs/agents/prompt.md)

### Claude Code Verification Pack

Install Possum's Claude Code skill globally so Claude knows Possum exists across projects:

```bash
possum agent install claude-code
```

This writes:

```text
~/.claude/skills/possum-verify/SKILL.md
```

For a repository-local skill that can be checked into a project, run:

```bash
possum agent install claude-code --project
```

This writes:

```text
.claude/skills/possum-verify/SKILL.md
```

The installer is non-destructive. If a different `possum-verify` skill already exists, Possum skips it unless you pass `--force`.

The agent loop should look like:

1. Coding agent implements the requested change.
2. Coding agent decides whether the change affects a customer-facing workflow.
3. If the change is customer-facing, run `possum verify-diff`; if explicit acceptance criteria exist, run `possum verify-feature --brief feature.json`; for broader app health, run `possum verify-app`.
4. Possum writes findings, reports, screenshots, traces, and repro scripts.
5. Coding agent fixes any relevant finding.
6. Coding agent runs `possum replay <reproPath>` or another relevant Possum verification to confirm the customer failure no longer reproduces.

The MCP server exposes the same workflow through `verify_diff`, `verify_feature`, `verify_app`, `run_audit`, `list_findings`, `get_finding`, `get_report`, and `replay_finding`, so coding agents can invoke Possum without shell-specific glue. After `possum init`, MCP `verify_diff`, `verify_app`, or `run_audit` can be called with just the repository root. Explicit MCP parameters still override config values.

Use the verification command that matches the agent's intent:

| Command | Use when |
|---|---|
| `verify-diff` / `verify_diff` | The agent changed customer-facing code and should infer what to verify from git diff. |
| `verify-feature` / `verify_feature` | The task has explicit acceptance criteria or a written feature brief. |
| `verify-app` / `verify_app` | The agent needs broader app confidence beyond a single change. |

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

Then run configured app verification:

```bash
possum audit
```

`target.command` is optional. If it is omitted, Possum expects the app to already be running at `target.url`.

Explicit flags override config values:

```bash
possum verify-app --url http://localhost:5173
possum verify-app --command "npm run preview" --url http://localhost:4173
```

Commands from config use the same sandbox as `--command`: no shell chaining, pipes, redirection, backgrounding, command substitution, newlines, or executable paths.

While an audit runs, Possum prints live per-phase progress to stderr (`possum: [1/3] beginner …`, `… judge — 1/1 findings accepted`) so you can see it working. The machine-readable result lines (run id, report path, surface path) go to stdout, so `possum audit > out.txt` keeps that output clean while progress still shows in your terminal.

Commands config same sandbox `--command`: no shell chaining, pipes, redirection, backgrounding, command substitution, newlines, executable paths. While verification runs, Possum prints live progress to stderr and machine-readable result lines (run id, report path, surface path) to stdout.

## Authenticated Verification

For apps that require login, record a browser session once:

```bash
possum auth record
```

Possum starts the configured app, opens a headed browser, waits while you log in manually, then saves Playwright storage state to `.possum/auth/default.json` and updates `possum.config.json`:

```json
{ "auth": { "storageState": ".possum/auth/default.json" } }
```

All verification commands then use that auth state automatically, including MCP `verify_app`, `verify_feature`, `verify_diff`, and `run_audit`. Use named profiles or explicit paths when needed:

```bash
possum auth record --name admin
possum verify-app --auth admin
possum verify-diff --auth .possum/auth/admin.json
```

`possum init` and `possum auth record` ensure `.possum/auth/` is gitignored because storage state contains cookies and tokens.

## Feature Verification

Use `possum verify-feature --brief feature.json` when a coding agent has just completed a specific feature and wants independent browser verification.

```json
{
  "feature": "Added CSV export to reports",
  "pages": ["/reports"],
  "setup": ["Open the Reports page"],
  "checks": [
    {
      "text": "Click Export CSV and confirm a CSV downloads",
      "hints": {
        "clickText": "Export CSV",
        "expectedDownload": ".csv"
      }
    }
  ]
}
```

Feature verification is model-backed. It uses the configured LLM to drive the app in the browser, records `passed` / `failed` / `inconclusive` results in `.possum/runs/<runId>/verification.json`, and writes normal Possum finding artifacts for failed checks.

## Diff Verification

Use `possum verify-diff` after changing user-facing behavior. Possum reads git changes, asks the configured model to infer a feature brief, saves that brief, then runs the normal feature verification engine.

```bash
possum verify-diff
possum verify-diff --base main
possum verify-diff --brief-out feature.generated.json --no-run
```

Default behavior prefers uncommitted working-tree changes. If there are none, Possum compares the current branch against `origin/main`, then `main`. During a full run, the generated brief is saved to `.possum/runs/<runId>/diff-brief.json` so agents and humans can inspect what Possum decided to verify.

## Claim-vs-Reality Verification

When a model is configured, Possum verifies whether the running app actually delivers on the claims it makes about itself. It is fully opt-in: with no `models` block, the deterministic core behaves exactly as before and no model is called.

Add a `models` block to `possum.config.json`:

```json
{
  "target": {
    "url": "http://localhost:3000",
    "command": "npm run dev"
  },
  "models": {
    "provider": "anthropic",
    "personaModel": "claude-opus-4-8",
    "judgeModel": "claude-opus-4-8"
  }
}
```

Set `ANTHROPIC_API_KEY` in the environment, then run `possum audit` as usual. Possum extracts the app's homepage and README claims, triages them to the ones a customer could verify through the UI, and drives a browser agent to try to fulfil each one within the configured step budget (`budgets.maxStepsPerPersona`). `budgets.maxMinutesPerPersona` bounds the claims phase wall-clock time, and `budgets.requestTimeoutSeconds` bounds each LLM request. A claim the agent cannot fulfil on every attempt becomes a `finding_claim_unfulfilled_*` finding with a trace and a reproducible Playwright spec, written through the same judge gate and report format as every other finding.

### Providers

- `anthropic` — uses the Anthropic API. Set `ANTHROPIC_API_KEY`. Models are Claude model ids, e.g. `claude-opus-4-8`.
- `openrouter` — uses [OpenRouter](https://openrouter.ai)'s OpenAI-compatible API. Set `OPENROUTER_API_KEY`. Models are OpenRouter slugs, e.g. `openai/gpt-4o` or `anthropic/claude-3.7-sonnet`.

```json
{
  "target": { "url": "http://localhost:3000" },
  "models": {
    "provider": "openrouter",
    "personaModel": "openai/gpt-4o",
    "judgeModel": "openai/gpt-4o-mini"
  }
}
```

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

Avoid browser-blocked ports such as `4190`; Possum rejects them before starting the app because Playwright and Node `fetch()` cannot reach them.

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
