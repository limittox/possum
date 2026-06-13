# Possum

**Possum is the open-source local customer simulator for AI-built apps.**

It answers one question:

> Can a real customer understand and use the app your coding agent just built?

Possum runs against a local web app, reads what the app claims to do, sends
simulated customers through it in a browser, and writes reproducible evidence a
coding agent can fix.

## What It Does

- Runs locally against `localhost` with `possum audit`.
- Simulates customers such as beginner, impatient, hostile, and returning users.
- Tests claim-vs-reality from README, homepage, and product copy.
- Writes plain-file evidence under `.possum/runs/<id>`.
- Produces screenshots, persona traces, findings JSON/Markdown, and Playwright
  repro scripts.
- Replays failures with `possum replay <finding>`.
- Renders existing runs with `possum report`.

## Coding Agent Integration

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

## License

Possum is licensed under Apache-2.0.
