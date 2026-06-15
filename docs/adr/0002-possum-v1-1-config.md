# ADR 0002: Possum v1.1 App Configuration

Date: 2026-06-15
Status: Accepted
Version: v1.1 config slice

## Context

Possum v1 proves the local customer-simulator core works through CLI and MCP. Developers can run `possum audit --url <url>` against an already-running app, or `possum audit --command "<command>" --url <url>` to let Possum start the app first.

That is enough for explicit manual use, but it is still too much repeated setup for coding-agent workflows. After Claude Code, Codex, or another coding agent finishes a task, the agent should be able to decide that persona-based testing is useful and call Possum without rediscovering the app URL or startup command every time.

The next version should make the app-under-test configuration durable in the project being audited, while preserving v1's local-first, account-free behavior.

## Decision

Possum v1.1 will add project config support.

Accepted v1.1 surface:

- Add `possum init` to create a starter `possum.config.json` in the audited app repository.
- Make `possum audit` read `possum.config.json` by default from the current working directory or explicit root.
- Keep `possum audit --url <url>` working for already-running apps.
- Keep `possum audit --command "<command>" --url <url>` working for one-off app startup.
- Make CLI flags override config file values.
- Let MCP `run_audit` use config by passing only the app root directory when the config contains the target URL and optional startup command.
- Keep command sandbox behavior unchanged from v1.

Initial config shape:

```json
{
  "target": {
    "url": "http://localhost:3000",
    "command": "npm run dev"
  }
}
```

`target.command` is optional. If omitted, Possum assumes the target app is already running at `target.url`.

Precedence order:

1. Explicit CLI or MCP parameters.
2. Values from `possum.config.json`.
3. Helpful validation errors explaining the missing value.

## Rationale

Config-file support is the smallest next step that materially improves coding-agent integration. Agents should be able to run `possum audit` or call MCP `run_audit` from a repository and rely on committed project knowledge instead of guessing framework conventions.

Keeping the config plain JSON makes it easy for humans and agents to read, edit, diff, and review. It also matches Possum's v1 direction: local, inspectable evidence and behavior before hosted coordination features.

The command sandbox remains conservative because config files may be edited by agents. `target.command` must use the same safe command parser as v1 `--command`; config support should not reintroduce shell execution, chaining, pipes, redirects, or command substitution.

## Consequences

Positive:

- Developers can set up Possum once per app.
- Coding agents can call Possum with fewer arguments after finishing implementation tasks.
- MCP integration becomes more practical for Codex, Claude Code, and similar tools.
- Startup command and target URL become reviewable project state.
- Existing explicit CLI workflows remain supported.

Tradeoffs:

- Possum now owns a versioned config surface that needs validation and documentation.
- Precedence rules must stay simple and well tested.
- Error messages become more important because users may run `possum audit` with incomplete config.
- Monorepos may need richer discovery later; v1.1 should not overfit that before the basic config path works.

## Verification Plan

v1.1 should ship with tests proving:

- `possum init` creates a valid starter config.
- `possum audit` reads `target.url` from `possum.config.json`.
- `possum audit` reads and sandbox-validates `target.command` from config.
- CLI flags override config values.
- MCP `run_audit` can use config with only a root directory.
- Existing v1 `--url` and `--command --url` flows still work.
- Helpful errors are emitted when required config values are missing.

Documentation updates should cover:

- How to initialize config.
- How humans run Possum after config exists.
- How coding agents should call Possum after completing implementation work.
- How config, CLI flags, and MCP parameters interact.

## Follow-Ups

- Decide whether config should support alternate filenames after v1.1 usage is known.
- Add monorepo workspace discovery only after real projects require it.
- Consider `possum config doctor` if config validation grows beyond simple startup checks.
- Add examples for Codex and Claude Code agent hooks once the config contract exists.
