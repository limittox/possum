# ADR 0003: Possum v0.1.2 Coding Agent Integration Guidance

Date: 2026-06-15
Status: Accepted
Version: v0.1.2 agent docs slice

## Context

Possum v0.1.0 established the local customer-simulator core and MCP tool surface. Possum v0.1.1 added `possum.config.json`, so a repository can carry the app URL and optional startup command that humans and coding agents need for repeatable audits.

The next adoption gap is not another runtime primitive. It is making the intended coding-agent loop explicit enough that users can paste it into Codex, Claude Code, or a generic agent instruction file.

Possum should remain CLI-first and MCP-friendly. The guidance must tell agents when to run Possum, how to run it, what evidence to inspect, and how to continue repair work without turning Possum into a code-editing agent.

## Decision

Possum v0.1.2 will add documentation for coding-agent integration.

Accepted v0.1.2 docs surface:

- `docs/agents/codex.md` for Codex-oriented project guidance.
- `docs/agents/claude-code.md` for Claude Code-oriented project guidance.
- `docs/agents/prompt.md` with a portable copy-paste instruction block for any coding agent.
- README links from the coding-agent section to the agent docs.

Agent guidance will standardize this loop:

1. After implementing a user-facing change, decide whether persona-based testing is useful.
2. If `possum.config.json` exists, run `possum audit`.
3. If no config exists, suggest `possum init` rather than guessing app startup details.
4. Inspect the generated `.possum/runs/<runId>/report.md`.
5. For relevant confirmed findings, inspect finding artifacts and generated repros.
6. Fix the app, then run `possum replay <reproPath>` or another audit to verify the customer failure no longer reproduces.

Guidance will prefer MCP tools when an agent has Possum MCP configured:

- `run_audit`
- `list_findings`
- `get_finding`
- `get_report`
- `replay_finding`

The CLI remains the fallback and the common denominator.

## Rationale

Possum's product promise is strongest when coding agents use it automatically at the right moments. Runtime support alone is insufficient if agents do not know the trigger conditions or evidence loop.

Documentation is the smallest useful v0.1.2 slice because it turns the v0.1.1 config contract into a repeatable workflow without adding speculative hook systems or agent-specific plugins too early.

Keeping Codex, Claude Code, and generic prompt guidance separate lets each page speak in the terms users expect while sharing the same Possum behavior.

## Consequences

Positive:

- Users can copy Possum instructions into coding-agent projects immediately.
- Agent integrations become discoverable without reading implementation code.
- Possum keeps CLI and MCP as first-class surfaces.
- The project avoids prematurely building fragile auto-hook integrations before usage patterns are clear.

Tradeoffs:

- The first v0.1.2 slice is documentation, not runtime automation.
- Users still need to wire instructions into their coding-agent environment.
- Agent behavior depends on each agent honoring project instructions.

## Verification Plan

v0.1.2 docs should be verified by:

- Checking docs are linked from README.
- Checking each agent doc includes when to run Possum, how to run it, how to inspect results, and how to verify fixes.
- Running `git diff --check`.

## Follow-Ups

- Add tested example project instruction files if users ask for concrete `.codex` or Claude project-file templates.
- Consider lightweight runtime helpers for agent hooks after real usage shows the right shape.
- Add MCP configuration examples once Possum has documented install/setup commands for MCP clients.
