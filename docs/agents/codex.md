# Using Possum With Codex

Possum is useful after Codex changes customer-facing product behavior: pages, onboarding, forms, checkout, navigation, empty states, auth flows, or copy that claims a workflow works.

## Project Setup

Run this once in the app repository:

```bash
possum init
```

Review `possum.config.json` and set:

```json
{
  "target": {
    "url": "http://localhost:3000",
    "command": "npm run dev"
  }
}
```

`target.command` is optional. Remove it when the app is already running before Codex calls Possum.

## Codex Instruction

Add this to the project instructions Codex reads, such as `AGENTS.md`:

```text
After changing customer-facing behavior, decide whether browser verification would be useful. If you just completed a specific feature, prefer `possum verify-feature --brief feature.json` (or MCP `verify_feature`) with the feature description, relevant pages, setup steps, and expected checks. Use `possum verify-app` for broader app health checks. If this repository has possum.config.json, `possum audit` remains available as a compatibility alias after the implementation builds or the app can start. Inspect the generated `.possum/runs/<runId>/report.md`. For each relevant confirmed finding, inspect the finding artifacts and generated repro, fix the app, then run `possum replay <reproPath>` or another `possum audit` to verify the customer failure no longer reproduces. If possum.config.json is missing, suggest running `possum init` instead of guessing the app URL or startup command.
```

## CLI Workflow

After Codex finishes a task:

```bash
possum verify-app
```

Then inspect the report path printed by Possum:

```bash
possum report <runId>
```

For a relevant finding, use the generated repro path:

```bash
possum replay .possum/runs/<runId>/findings/<findingId>/repro.spec.ts
```

## MCP Workflow

If Codex has the Possum MCP server configured, prefer MCP for structured results:

1. Call `verify_app` or `run_audit` with the repository root.
2. Call `get_report` for the returned `runId`.
3. Call `list_findings` to get finding summaries.
4. Call `get_finding` for relevant confirmed findings.
5. Call `replay_finding` to get the replay command for a generated repro.

Explicit MCP `targetUrl` or `runCommand` parameters override `possum.config.json`.

## When To Skip Possum

Do not run Possum for changes that cannot affect a customer workflow, such as internal refactors, pure test changes, dependency metadata, or documentation-only edits.

When unsure, prefer running Possum if the change touches a visible page, user input, navigation, onboarding, checkout, authentication, or any flow described in product copy.
