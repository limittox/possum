# Possum v0.1.2 Agent Docs Working State

Date: 2026-06-15

ADR: `docs/adr/0003-possum-v0-1-2-agent-integration-guidance.md`

## Implemented

- Added Codex integration guidance in `docs/agents/codex.md`.
- Added Claude Code integration guidance in `docs/agents/claude-code.md`.
- Added portable copy-paste agent instructions in `docs/agents/prompt.md`.
- Linked the agent docs from README.

## Verification

Run before completion:

```bash
git diff --check
```

Optional docs sanity check:

```bash
find docs/agents -maxdepth 1 -type f | sort
```
