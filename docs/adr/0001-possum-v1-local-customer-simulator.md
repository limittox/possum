# ADR 0001: Possum v1 Local Customer Simulator

Date: 2026-06-15

Status: Accepted

Version: v0.1.0 / v1 working state

## Context

Possum v1 was created to establish the open-source local core before adding richer hosted or model-driven surfaces. The product direction is to position Possum as the local customer simulator for AI-built apps, not as a QA dashboard, test-management product, or self-healing regression-test platform.

The v1 goal was to make Possum runnable end to end from a developer machine and useful to coding agents. It needed to audit local web apps, collect plain-file evidence, expose an MCP tool surface, and generate reproducible artifacts that a coding agent can inspect and fix against.

## Decision

Possum v1 is a local-first TypeScript CLI and MCP server licensed under Apache-2.0.

The accepted v1 surface is:

- `possum audit --url <url>` to audit an already-running local app.
- `possum audit --command "<command>" --url <url>` to start a local app, wait for the URL, audit it, and stop the process.
- `possum report <runId>` to print a saved Markdown run report.
- `possum replay <reproPath>` to run a generated Playwright repro.
- `possum doctor` to check Playwright/Chromium dependency readiness.
- `possum mcp` to expose coding-agent tools over stdio.

The MCP tool surface is:

- `run_audit`
- `list_findings`
- `get_finding`
- `get_report`
- `replay_finding`

The local evidence format is plain files under `.possum/runs/<runId>`:

- `surface.json`
- `findings.json`
- `report.md`
- persona trace files
- screenshot files when capture succeeds
- per-finding `report.md`, `trace.json`, and `repro.spec.ts`

The v1 persona probes are deterministic browser-backed checks:

- Beginner: confirms whether the first screen has an obvious next action.
- Impatient: rapidly submits the first form and detects duplicate submissions.
- Hostile: submits unexpected input and detects HTTP 500+ form responses.

The v1 claim extraction layer records deterministic homepage and README claim evidence in `surface.json`. It does not yet use an LLM to semantically judge whether every claim is fulfilled.

The v1 finding gate accepts only schema-valid, confirmed, reproduced findings and suppresses duplicate `dedupeFingerprint` values before reports and artifacts are written.

The v1 run-command sandbox starts commands without a shell. It accepts environment assignments, a bare executable from `PATH`, and arguments. It rejects shell chaining, pipes, redirection, backgrounding, command substitution, newlines, and executable paths.

The v1 package build emits runtime source only through `tsconfig.build.json`, while `npm run typecheck` still checks both source and tests.

## Rationale

CLI-first keeps Possum usable without an account and easy to call from any coding agent. MCP is still first-class because coding agents such as Codex and Claude Code need structured tool calls and machine-readable outputs.

Plain-file evidence keeps the core auditable and easy to debug. A coding agent can read the report, inspect traces and screenshots, and run the generated repro without depending on a hosted Possum service.

Deterministic v1 probes make the first release reliable and testable. They also establish the contracts needed for later model-driven persona simulation: claim extraction, trace output, finding schema, repro generation, and judge/dedupe behavior.

The run-command sandbox is intentionally conservative because `audit --command` can be invoked by coding agents. Starting app commands without a shell removes shell metacharacter behavior and makes the allowed command shape inspectable.

Apache-2.0 maximizes adoption and enterprise comfort for the open-source local core. Hosted parallel runs, team history, managed browsers, model proxying, scheduled audits, and private connectors remain possible commercial surfaces later.

## Consequences

Positive:

- Possum v1 can be run locally against localhost apps.
- Coding agents can invoke Possum through CLI or MCP.
- Evidence is inspectable and reproducible.
- The implementation has fixture apps that prove known finding classes.
- The packaging path excludes compiled tests from the npm tarball.

Tradeoffs:

- Possum v1 does not run autonomous LLM agents.
- Claim-vs-reality is recorded as evidence, but broad semantic claim judging is deferred.
- The command sandbox rejects some valid shell conveniences, such as `cd app && npm run dev` or `./node_modules/.bin/vite`.
- The deterministic probes cover only the initial known failure classes.

## Verification

The v1 completion audit verified:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `git diff --check`
- `npm pack --dry-run`
- CLI help for `audit`, `report`, `replay`, `mcp`, and `doctor`
- linked `possum --help` after `npm link`
- compiled audit smoke against `fixtures/apps/beginner-dead-end`

The fixture smoke verified:

- Possum starts the fixture app with `--command`.
- `surface.json`, `findings.json`, and `report.md` are written.
- `surface.json` contains homepage and README claim sources.
- `finding_beginner_dead_end_001` is produced.
- the app process is stopped after the audit.

## Key Commits

- `72347b2 feat: start app command for audits`
- `7b7e496 feat: sandbox run commands`
- `fe10509 feat: add finding judge gate`
- `16c7781 feat: extract local app claims`
- `51af454 chore: clean package build output`
- `0364e05 docs: mark v1 working state complete`
- `49ce2e2 fix: run linked cli entrypoint`

## Follow-Ups

- Create a new ADR for every version-level change after v1.
- Add richer model-driven persona simulation on top of the local evidence contracts.
- Add semantic claim-vs-reality judging after the deterministic claim extraction layer.
- Consider a config file for common app startup commands once the command sandbox contract has settled.
