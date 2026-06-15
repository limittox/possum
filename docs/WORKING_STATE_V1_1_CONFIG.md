# Possum v1.1 Config Working State

Date: 2026-06-15

ADR: `docs/adr/0002-possum-v1-1-config.md`

## Implemented

- `possum init` writes `possum.config.json`.
- `possum audit` reads `target.url` and optional `target.command` from config when flags are omitted.
- CLI `--url` and `--command` override config values.
- MCP `run_audit` accepts calls with only `rootDir` when config supplies target settings.
- `target.command` uses the existing run-command sandbox path.
- README documents config-first human and coding-agent workflows.

## Focused Verification

Passed:

```bash
npm test -- tests/configContract.test.ts tests/configCli.test.ts tests/configMcp.test.ts
```

## Full Verification

Passed:

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Additional compiled CLI smoke passed in `/tmp`:

```bash
node /home/yathu/code/possum/dist/src/cli/main.js init
node /home/yathu/code/possum/dist/src/cli/main.js audit
```
