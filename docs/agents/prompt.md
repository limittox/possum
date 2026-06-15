# Generic Coding Agent Prompt

Use this instruction with any coding agent that can run shell commands or call Possum through MCP.

```text
Possum is available in this repository as the local customer simulator.

After implementing a task, decide whether the change affects customer-facing behavior. Customer-facing behavior includes pages, navigation, onboarding, forms, auth, checkout, settings, empty states, user-visible errors, and product claims in README/homepage/copy.

If the change is customer-facing and `possum.config.json` exists, run:

possum audit

Inspect the generated `.possum/runs/<runId>/report.md`. For each relevant confirmed finding, inspect its trace, screenshots, and generated Playwright repro. Use the finding as repair evidence, fix the app, and then verify with:

possum replay <reproPath>

or run another:

possum audit

If `possum.config.json` does not exist, do not guess the app URL or startup command. Suggest running:

possum init

Skip Possum for documentation-only changes, internal refactors, test-only changes, dependency metadata, or changes that cannot affect a customer workflow.

If the Possum MCP server is configured, prefer MCP tools for structured access:

- run_audit
- get_report
- list_findings
- get_finding
- replay_finding

Use CLI commands as the fallback.
```

## Expected Agent Loop

1. Implement the requested change.
2. Build or start the app as the project normally requires.
3. Run Possum only when the change affects customer-facing behavior.
4. Read the report before claiming the task is complete.
5. Fix relevant confirmed findings.
6. Replay the finding or rerun the audit.

## Config Reminder

`possum.config.json` should contain:

```json
{
  "target": {
    "url": "http://localhost:3000",
    "command": "npm run dev"
  }
}
```

`target.command` is optional. Commands use Possum's sandbox, so avoid shell chaining, pipes, redirection, backgrounding, command substitution, newlines, and executable paths.
