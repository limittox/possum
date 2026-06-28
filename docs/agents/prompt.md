# Generic Coding Agent Prompt

Use this instruction with any coding agent that can run shell commands or call Possum through MCP.

```text
Possum is available in this repository as the local customer simulator.

After implementing a task, decide whether the change affects customer-facing behavior. Customer-facing behavior includes pages, navigation, onboarding, forms, auth, checkout, settings, empty states, user-visible errors, and product claims in README/homepage/copy.

Prefer `possum verify-diff` (or MCP `verify_diff`) after user-facing code changes. Possum will infer feature checks from git diff and verify them in the browser.

If the user supplied explicit acceptance criteria, use `possum verify-feature --brief feature.json` (or MCP `verify_feature`) with the feature description, relevant pages, setup steps, and expected checks.

Use `possum verify-app` (or MCP `verify_app`) for broader app health checks.

If the change is customer-facing and `possum.config.json` exists, run:

possum verify-diff

Inspect the generated `.possum/runs/<runId>/report.md`. For each relevant confirmed finding, inspect its trace, screenshots, and generated Playwright repro. Use the finding as repair evidence, fix the app, and then verify with:

possum replay <reproPath>

or run another relevant Possum verification.

If `possum.config.json` does not exist, do not guess the app URL or startup command. Suggest running:

possum init

Skip Possum for documentation-only changes, internal refactors, test-only changes, dependency metadata, or changes that cannot affect a customer workflow.

If the Possum MCP server is configured, prefer MCP tools for structured access:

- verify_diff
- verify_feature
- verify_app
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
4. Prefer `verify-diff` / `verify_diff` for user-facing code changes, `verify-feature` / `verify_feature` when acceptance criteria are explicit, and `verify-app` / `verify_app` for broader app confidence.
5. Read the report before claiming the task is complete.
6. Fix relevant confirmed findings.
7. Replay the finding or rerun the relevant Possum verification.

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
