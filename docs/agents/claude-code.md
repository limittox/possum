# Using Possum With Claude Code

Possum gives Claude Code a local customer-simulation check after it changes an app. The goal is not broad test coverage; the goal is to catch product failures a real customer would hit in the browser.

## Project Setup

Create app config once:

```bash
possum init
```

Edit `possum.config.json`:

```json
{
  "target": {
    "url": "http://localhost:3000",
    "command": "npm run dev"
  }
}
```

Use `target.command` when Possum should start the app. Omit it when Claude Code or the user starts the app separately.

## Claude Code Instruction

Add this to the Claude Code project memory or repository instructions:

```text
When you complete a task that changes customer-facing behavior, consider running Possum. If you just completed a specific feature, prefer `possum verify-feature --brief feature.json` (or MCP `verify_feature`) with the feature description, relevant pages, setup steps, and expected checks. Use `possum verify-app` for broader app health checks. If `possum.config.json` exists and the app can be started, `possum audit` remains available as a compatibility alias. Read the generated `.possum/runs/<runId>/report.md`. Treat confirmed findings as repair inputs, inspect the finding trace/screenshots/repro, fix the app, and verify with `possum replay <reproPath>` or a follow-up `possum audit`. Do not run Possum for documentation-only work, internal refactors, or changes that cannot affect a customer workflow. If config is missing, ask to run `possum init` rather than guessing the app startup command.
```

## CLI Workflow

Run:

```bash
possum verify-app
```

Read the report:

```bash
possum report <runId>
```

Replay a finding:

```bash
possum replay .possum/runs/<runId>/findings/<findingId>/repro.spec.ts
```

## MCP Workflow

When the Possum MCP server is available, Claude Code can use:

- `verify_feature`
- `verify_app`
- `run_audit`
- `get_report`
- `list_findings`
- `get_finding`
- `replay_finding`

Call `verify_app` or `run_audit` with the repository root when `possum.config.json` exists. Pass explicit `targetUrl` or `runCommand` only for one-off overrides.

## Good Trigger Examples

- A new onboarding step.
- A changed form or validation path.
- A changed checkout, signup, login, or settings flow.
- Navigation or routing changes.
- Homepage or README claims about what the app can do.
- Bug fixes where a customer-facing repro should be verified.
