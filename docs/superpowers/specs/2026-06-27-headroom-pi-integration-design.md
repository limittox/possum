# Headroom integration for Pi — design

**Date:** 2026-06-27
**Status:** Approved

## Goal

Configure Pi to use the locally installed Headroom tooling without relying on Headroom's agent-specific installers, which currently support Claude, Codex, Copilot, and OpenClaw but not Pi.

## Current state

- Headroom CLI is installed at `/home/yathu/.local/bin/headroom`.
- Headroom's bundled `rtk` binary exists at `/home/yathu/.headroom/bin/rtk`, but Pi-launched shell commands do not currently have that directory on `PATH`.
- Pi global settings live under `~/.pi/agent/`.
- Pi supports global TypeScript extensions in `~/.pi/agent/extensions/`.
- Pi supports provider/base URL overrides in `~/.pi/agent/models.json`.
- Headroom proxy is not currently running.

## Design

Add a global Pi extension at `~/.pi/agent/extensions/headroom.ts` that:

1. Prepends `/home/yathu/.headroom/bin` to `PATH` for the Pi process and tool executions.
2. Registers `headroom_retrieve`, `headroom_compress`, and `headroom_stats` tools that call the local Headroom proxy HTTP endpoints.
3. Registers `/headroom-status` to show whether the proxy and `rtk` are available.
4. Adds conservative prompt guidance explaining the tools.

Add `~/.pi/agent/models.json` provider overrides that route Pi's current OpenAI/Codex-compatible provider through Headroom's OpenAI-compatible proxy endpoint at `http://127.0.0.1:8787/v1`.

Do not auto-start the Headroom proxy from Pi. The user starts it separately. This avoids hidden background daemons and makes proxy failures obvious.

## Safety

- Preserve existing Pi settings.
- Back up any existing `~/.pi/agent/models.json` before overwriting it.
- Keep all changes global to Pi under `~/.pi/agent/`.
- Do not modify application project code.

## Usage

Start Headroom separately, for example:

```bash
headroom proxy --backend openrouter
```

Then restart Pi or run `/reload`. Use `/headroom-status` to verify proxy availability. The assistant can call `headroom_retrieve` when Headroom compression markers reference retrievable hashes.

## Self-review

- No placeholders remain.
- Scope is limited to Pi global configuration.
- Proxy startup is explicit and not hidden.
- Tool names match Headroom's existing CCR tool names.
