# Claude Code Verification Pack Design

## Summary

Add a Claude Code integration installer that gives Claude Code an opinionated Possum verification workflow without requiring users to copy instructions manually.

MVP command:

```bash
possum agent install claude-code
```

By default, the installer creates a personal/global Claude Code skill at:

```text
~/.claude/skills/possum-verify/SKILL.md
```

This makes Claude Code aware that Possum exists across new and existing projects.

For teams or repos that want the skill checked into the project, an explicit project-scoped install is available:

```bash
possum agent install claude-code --project
```

Project mode writes:

```text
.claude/skills/possum-verify/SKILL.md
```

The installed skill teaches Claude Code when and how to use Possum after coding user-facing app changes.

## Goals

- Make Possum easy to adopt in Claude Code projects.
- Make Claude Code aware of Possum globally so new projects can benefit without per-repo setup.
- Support an explicit project-local skill for teams that want checked-in repository guidance.
- Prefer `possum verify-diff` after user-facing code changes.
- Use `possum verify-feature --brief ...` when explicit acceptance criteria exist.
- Use `possum verify-app` for broad app confidence checks.
- Point Claude Code at Possum evidence: `report.html`, `report.md`, findings, screenshots, traces, `debug.json`, and `repair-hints.md`.
- Keep installation non-destructive and idempotent.

## Non-goals

- No active Claude Code hooks in the MVP.
- No automatic edits to `.claude/settings.json`.
- No automatic MCP server configuration.
- No automatic app startup or model configuration beyond existing Possum behavior.
- No generated Playwright tests or browser-control glue; Possum remains the higher-level verification workflow.

Hooks can be revisited later as an explicit opt-in feature, but the MVP should not install a `Stop` hook or run Possum automatically from Claude Code lifecycle events.

## User Experience

Default global install:

```bash
possum agent install claude-code
```

Expected output should summarize what happened:

```text
Installed global Claude Code Possum verification skill:
- ~/.claude/skills/possum-verify/SKILL.md

Next steps:
- Restart Claude Code if ~/.claude/skills did not exist when the session started.
- Ask Claude Code to use /possum-verify after customer-facing changes.
```

Project-local install:

```bash
possum agent install claude-code --project
```

Expected output:

```text
Installed project Claude Code Possum verification skill:
- .claude/skills/possum-verify/SKILL.md
```

If the target skill already exists with the same content, the command should be idempotent:

```text
Claude Code Possum verification skill already up to date:
- ~/.claude/skills/possum-verify/SKILL.md
```

If the target skill exists with different content, the command should refuse to overwrite by default:

```text
Skipped existing Claude Code skill with different content:
- ~/.claude/skills/possum-verify/SKILL.md

Re-run with --force to overwrite.
```

Explicit overwrite:

```bash
possum agent install claude-code --force
possum agent install claude-code --project --force
```

## CLI Shape

Add a nested command group:

```bash
possum agent install claude-code [--project] [--force]
```

Behavior:

1. Resolve target scope:
   - default: personal/global skill under `~/.claude/skills/possum-verify/SKILL.md`
   - `--project`: project skill under `.claude/skills/possum-verify/SKILL.md` in the current project root
2. Ensure the target `possum-verify` skill directory exists.
3. Write `SKILL.md` if missing.
4. If present and content matches, report unchanged.
5. If present and content differs, skip unless `--force` is set.
6. If `--force` is set, overwrite only the Possum-owned skill file at the selected scope.

The command must never modify unrelated `.claude` files or automatically sync global and project installs.

## Installed Skill Content

The generated `SKILL.md` should be concise and Claude Code-native.

Frontmatter:

```yaml
---
name: possum-verify
description: Use Possum to verify customer-facing web app changes after coding. Run after UI, routing, form, auth, onboarding, checkout, settings, or other browser-visible behavior changes.
---
```

Body requirements:

- Tell Claude Code to use this skill after customer-facing behavior changes.
- Prefer `possum verify-diff` because it infers checks from git changes.
- Use `possum verify-feature --brief <path>` when the user supplied acceptance criteria or a feature brief.
- Use `possum verify-app` for broad confidence.
- If `possum.config.json` is missing in the current project, ask the user to run `possum init`; do not guess startup commands.
- If authentication is required, mention `possum auth record` or configured auth state.
- Read `report.html` first when available; fall back to `report.md`.
- Treat confirmed findings as repair inputs.
- Inspect finding artifacts, especially screenshots, repro scripts, `debug.json`, and `repair-hints.md`.
- Fix relevant issues and rerun Possum until clean or explain inconclusive results.
- Skip Possum for docs-only work, internal refactors, and changes that cannot affect customer workflows.

## Implementation Boundaries

Create a small installer module, likely under `src/agents/`, that owns:

- generated file paths
- generated skill content
- non-destructive write logic
- result status data for CLI output

The CLI should call this module rather than embedding long templates directly in `src/cli/main.ts`.

Suggested public function:

```ts
installClaudeCodeVerificationPack({ rootDir, homeDir, scope, force }): Promise<InstallClaudeCodeVerificationPackResult>
```

Suggested result shape:

```ts
type InstallStatus = "installed" | "unchanged" | "skipped" | "overwritten";

type InstallScope = "global" | "project";

interface InstallClaudeCodeVerificationPackResult {
  skillPath: string;
  scope: InstallScope;
  status: InstallStatus;
}
```

## Testing

Add unit/CLI tests for:

- default command creates `~/.claude/skills/possum-verify/SKILL.md` using an injectable home directory in tests
- `--project` creates `.claude/skills/possum-verify/SKILL.md` in an empty temp project
- rerunning is idempotent when content matches
- refuses to overwrite existing different content by default in either scope
- `--force` overwrites existing different content in the selected scope
- CLI output includes global/project scope and installed/unchanged/skipped/overwritten status
- generated skill includes `verify-diff`, `verify-feature`, `verify-app`, `report.html`, and skip guidance

No browser tests are needed for this installer.

## Documentation

Update:

- `README.md`: add “Claude Code verification pack” setup snippet.
- `docs/agents/claude-code.md`: make installer the primary setup path and keep manual guidance as explanation.

## Success Criteria

- `possum agent install claude-code` installs a usable global Claude Code skill.
- `possum agent install claude-code --project` installs a usable project-local Claude Code skill.
- Existing user-authored skill content is not overwritten unless `--force` is passed.
- The generated skill makes Claude Code aware Possum exists and tells it to run the right Possum command for the situation.
- Tests cover installer safety and CLI behavior.
- Hooks are not installed or configured by this MVP.
