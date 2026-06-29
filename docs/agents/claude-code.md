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

## Install Claude Code Verification Skill

Install the Possum Claude Code skill globally so Claude knows Possum exists in every project:

```bash
possum agent install claude-code
```

This writes:

```text
~/.claude/skills/possum-verify/SKILL.md
```

For a repository-local skill that can be committed with a project, run:

```bash
possum agent install claude-code --project
```

This writes:

```text
.claude/skills/possum-verify/SKILL.md
```

The installer is non-destructive. Re-run with `--force` only when you intentionally want to replace an existing `possum-verify` skill.

After installation, ask Claude Code to use `/possum-verify` after customer-facing changes. Claude can also discover the skill when a task affects browser-visible behavior.

## CLI Workflow

After customer-facing code changes, run:

```bash
possum verify-diff
```

When explicit acceptance criteria are known, run:

```bash
possum verify-feature --brief feature.json
```

For broad app confidence, run:

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

- `verify_diff`
- `verify_feature`
- `verify_app`
- `run_audit`
- `get_report`
- `list_findings`
- `get_finding`
- `replay_finding`

Call `verify_diff` after user-facing code changes, `verify_feature` when explicit acceptance criteria exist, or `verify_app` for broad app confidence. Pass explicit `targetUrl` or `runCommand` only for one-off overrides.

## Good Trigger Examples

- A new onboarding step.
- A changed form or validation path.
- A changed checkout, signup, login, or settings flow.
- Navigation or routing changes.
- Homepage or README claims about what the app can do.
- Bug fixes where a customer-facing repro should be verified.
