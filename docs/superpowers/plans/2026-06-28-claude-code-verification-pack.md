# Claude Code Verification Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `possum agent install claude-code`, which installs a non-destructive Claude Code Possum verification skill globally by default and project-locally with `--project`.

**Architecture:** Add a focused installer module under `src/agents/` that owns generated skill content, path resolution, and non-destructive writes. Wire it into the CLI through a nested `agent install claude-code` command and document the workflow as the primary Claude Code setup path.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Node.js `path`, Node.js `os.homedir`, Commander, Vitest.

## Global Constraints

- Default install writes `~/.claude/skills/possum-verify/SKILL.md`.
- `--project` writes `.claude/skills/possum-verify/SKILL.md` under the CLI `cwd`.
- Existing different skill content is skipped unless `--force` is passed.
- The installer must never edit `.claude/settings.json`, hooks, MCP configuration, `.headroom/`, or `AGENTS.md`.
- Hooks are not installed or configured by this MVP.
- Use `/home/yathu/.headroom/bin/rtk proxy` for shell commands in this repo.
- Commit after each independently passing task.

---

## File Structure

- Create `src/agents/claudeCodePack.ts`
  - Exports installer types, generated skill content, target path helpers, and `installClaudeCodeVerificationPack()`.
  - Has no CLI dependency and no Commander imports.
- Create `tests/claudeCodePack.test.ts`
  - Unit tests for generated content, global/project path resolution, idempotence, non-destructive skip, and forced overwrite.
- Modify `src/cli/main.ts`
  - Adds `homeDir?: string` to `CliDependencies` for tests.
  - Imports `homedir` from `node:os` and the installer module.
  - Adds `possum agent install claude-code [--project] [--force]`.
- Modify `tests/cli.test.ts`
  - Adds CLI-level tests for default global install, `--project`, skip, and `--force` output.
- Modify `README.md`
  - Adds Claude Code verification pack setup snippet.
- Modify `docs/agents/claude-code.md`
  - Makes installer-first setup the primary path.

---

### Task 1: Add Claude Code pack installer module

**Files:**
- Create: `src/agents/claudeCodePack.ts`
- Create: `tests/claudeCodePack.test.ts`

**Interfaces:**
- Produces:
  - `type ClaudeCodePackScope = "global" | "project"`
  - `type ClaudeCodePackInstallStatus = "installed" | "unchanged" | "skipped" | "overwritten"`
  - `interface InstallClaudeCodeVerificationPackInput`
  - `interface InstallClaudeCodeVerificationPackResult`
  - `const CLAUDE_CODE_POSSUM_SKILL_RELATIVE_PATH`
  - `function renderClaudeCodePossumSkill(): string`
  - `function getClaudeCodePossumSkillPath(input): string`
  - `function installClaudeCodeVerificationPack(input): Promise<InstallClaudeCodeVerificationPackResult>`
- Consumes: Node `fs/promises`, Node `path`.

- [ ] **Step 1: Write failing installer tests**

Create `tests/claudeCodePack.test.ts` with this content:

```ts
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getClaudeCodePossumSkillPath,
  installClaudeCodeVerificationPack,
  renderClaudeCodePossumSkill
} from "../src/agents/claudeCodePack.js";

describe("Claude Code verification pack installer", () => {
  it("renders skill instructions for Possum verification", () => {
    const skill = renderClaudeCodePossumSkill();

    expect(skill).toContain("name: possum-verify");
    expect(skill).toContain("possum verify-diff");
    expect(skill).toContain("possum verify-feature --brief");
    expect(skill).toContain("possum verify-app");
    expect(skill).toContain("report.html");
    expect(skill).toContain("report.md");
    expect(skill).toContain("debug.json");
    expect(skill).toContain("repair-hints.md");
    expect(skill).toContain("Skip Possum");
    expect(skill).toContain("possum init");
  });

  it("resolves global skill path under home directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-root-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));

    expect(getClaudeCodePossumSkillPath({ rootDir, homeDir, scope: "global" })).toBe(
      join(homeDir, ".claude", "skills", "possum-verify", "SKILL.md")
    );
  });

  it("resolves project skill path under root directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));

    expect(getClaudeCodePossumSkillPath({ rootDir, homeDir, scope: "project" })).toBe(
      join(rootDir, ".claude", "skills", "possum-verify", "SKILL.md")
    );
  });

  it("installs global skill by default", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-root-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));

    const result = await installClaudeCodeVerificationPack({ rootDir, homeDir });

    expect(result).toEqual({
      scope: "global",
      status: "installed",
      skillPath: join(homeDir, ".claude", "skills", "possum-verify", "SKILL.md")
    });
    await expect(readFile(result.skillPath, "utf8")).resolves.toBe(renderClaudeCodePossumSkill());
  });

  it("installs project skill when requested", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));

    const result = await installClaudeCodeVerificationPack({ rootDir, homeDir, scope: "project" });

    expect(result).toEqual({
      scope: "project",
      status: "installed",
      skillPath: join(rootDir, ".claude", "skills", "possum-verify", "SKILL.md")
    });
    await expect(readFile(result.skillPath, "utf8")).resolves.toBe(renderClaudeCodePossumSkill());
  });

  it("is idempotent when existing skill content matches", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-idempotent-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));

    await installClaudeCodeVerificationPack({ rootDir, homeDir });
    const result = await installClaudeCodeVerificationPack({ rootDir, homeDir });

    expect(result.status).toBe("unchanged");
    await expect(readFile(result.skillPath, "utf8")).resolves.toBe(renderClaudeCodePossumSkill());
  });

  it("skips existing different content without force", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-skip-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));
    const skillPath = getClaudeCodePossumSkillPath({ rootDir, homeDir, scope: "global" });
    await writeFile(skillPath, "custom skill", "utf8");

    const result = await installClaudeCodeVerificationPack({ rootDir, homeDir });

    expect(result.status).toBe("skipped");
    await expect(readFile(skillPath, "utf8")).resolves.toBe("custom skill");
  });

  it("overwrites existing different content with force", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-force-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));
    const skillPath = getClaudeCodePossumSkillPath({ rootDir, homeDir, scope: "project" });
    await writeFile(skillPath, "custom project skill", "utf8");

    const result = await installClaudeCodeVerificationPack({
      rootDir,
      homeDir,
      scope: "project",
      force: true
    });

    expect(result.status).toBe("overwritten");
    await expect(readFile(skillPath, "utf8")).resolves.toBe(renderClaudeCodePossumSkill());
  });
});
```

- [ ] **Step 2: Run installer tests and verify they fail because the module does not exist**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/claudeCodePack.test.ts
```

Expected: FAIL with an import/module-not-found error for `../src/agents/claudeCodePack.js`.

- [ ] **Step 3: Implement installer module**

Create `src/agents/claudeCodePack.ts` with this content:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ClaudeCodePackScope = "global" | "project";
export type ClaudeCodePackInstallStatus = "installed" | "unchanged" | "skipped" | "overwritten";

export interface InstallClaudeCodeVerificationPackInput {
  rootDir: string;
  homeDir: string;
  scope?: ClaudeCodePackScope;
  force?: boolean;
}

export interface GetClaudeCodePossumSkillPathInput {
  rootDir: string;
  homeDir: string;
  scope: ClaudeCodePackScope;
}

export interface InstallClaudeCodeVerificationPackResult {
  skillPath: string;
  scope: ClaudeCodePackScope;
  status: ClaudeCodePackInstallStatus;
}

export const CLAUDE_CODE_POSSUM_SKILL_RELATIVE_PATH = join(
  ".claude",
  "skills",
  "possum-verify",
  "SKILL.md"
);

export function getClaudeCodePossumSkillPath(input: GetClaudeCodePossumSkillPathInput): string {
  return join(input.scope === "global" ? input.homeDir : input.rootDir, CLAUDE_CODE_POSSUM_SKILL_RELATIVE_PATH);
}

export function renderClaudeCodePossumSkill(): string {
  return `---
name: possum-verify
description: Use Possum to verify customer-facing web app changes after coding. Run after UI, routing, form, auth, onboarding, checkout, settings, or other browser-visible behavior changes.
---

# Possum Verification

Use this skill after coding changes that can affect customer-facing browser behavior.

## When to run Possum

Run Possum after changes to UI, routing, forms, auth, onboarding, checkout, settings, dashboards, marketing pages, or any browser-visible customer workflow.

Skip Possum for documentation-only work, internal refactors, dependency chores, tests-only edits, and changes that cannot affect a customer workflow.

## Pick the command

1. Prefer diff-based verification after code changes:

   \`\`\`bash
   possum verify-diff
   \`\`\`

2. If the user supplied acceptance criteria or a feature brief, write the brief to a JSON file and run:

   \`\`\`bash
   possum verify-feature --brief <path>
   \`\`\`

3. For broad app confidence beyond one change, run:

   \`\`\`bash
   possum verify-app
   \`\`\`

## Before running

- If \`possum.config.json\` is missing in the current project, ask the user to run \`possum init\`. Do not guess the app startup command.
- If the app requires login, use configured Possum auth state when present. If auth is missing, ask the user to run \`possum auth record\`.
- If Possum reports that models are required, ask the user to configure the \`models\` block in \`possum.config.json\`.

## After running

- Open or read \`.possum/runs/<runId>/report.html\` first when available.
- Fall back to \`.possum/runs/<runId>/report.md\` if needed.
- Treat confirmed findings as repair inputs.
- Inspect finding artifacts before fixing: screenshots, traces, repro scripts, \`debug.json\`, and \`repair-hints.md\`.
- Fix relevant product failures, then rerun the same Possum verification until it is clean or explain why the result is inconclusive.

## Reporting back

Summarize the Possum command run, the run id, the report path, confirmed findings, fixes made, and final verification status.
`;
}

export async function installClaudeCodeVerificationPack(
  input: InstallClaudeCodeVerificationPackInput
): Promise<InstallClaudeCodeVerificationPackResult> {
  const scope = input.scope ?? "global";
  const skillPath = getClaudeCodePossumSkillPath({ rootDir: input.rootDir, homeDir: input.homeDir, scope });
  const desiredContent = renderClaudeCodePossumSkill();

  await mkdir(dirname(skillPath), { recursive: true });

  const existingContent = await readTextFileIfExists(skillPath);
  if (existingContent === desiredContent) {
    return { skillPath, scope, status: "unchanged" };
  }

  if (existingContent !== undefined && !input.force) {
    return { skillPath, scope, status: "skipped" };
  }

  await writeFile(skillPath, desiredContent, "utf8");

  return {
    skillPath,
    scope,
    status: existingContent === undefined ? "installed" : "overwritten"
  };
}

async function readTextFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
```

- [ ] **Step 4: Run installer tests and verify they pass**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/claudeCodePack.test.ts
```

Expected: PASS for all tests in `tests/claudeCodePack.test.ts`.

- [ ] **Step 5: Run typecheck**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit installer module**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy git add src/agents/claudeCodePack.ts tests/claudeCodePack.test.ts
/home/yathu/.headroom/bin/rtk proxy git commit -m "feat: add claude code verification pack installer"
```

Expected: commit succeeds.

---

### Task 2: Add CLI command for Claude Code pack installation

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**
- Consumes from Task 1:
  - `installClaudeCodeVerificationPack(input)`
  - `InstallClaudeCodeVerificationPackResult`
- Produces:
  - CLI command `possum agent install claude-code [--project] [--force]`
  - `CliDependencies.homeDir?: string`

- [ ] **Step 1: Write failing CLI tests**

Append these tests inside the existing `describe("CLI", () => { ... })` block in `tests/cli.test.ts`:

```ts
  it("installs Claude Code pack globally by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-root-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code"]);

    const skillPath = join(home, ".claude", "skills", "possum-verify", "SKILL.md");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("possum verify-diff");
    expect(output).toEqual([
      "Installed global Claude Code Possum verification skill:",
      "- ~/.claude/skills/possum-verify/SKILL.md",
      "",
      "Next steps:",
      "- Restart Claude Code if ~/.claude/skills did not exist when the session started.",
      "- Ask Claude Code to use /possum-verify after customer-facing changes."
    ]);
  });

  it("installs Claude Code pack into project when requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-project-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code", "--project"]);

    const skillPath = join(root, ".claude", "skills", "possum-verify", "SKILL.md");
    await expect(readFile(skillPath, "utf8")).resolves.toContain("possum verify-app");
    expect(output).toEqual([
      "Installed project Claude Code Possum verification skill:",
      "- .claude/skills/possum-verify/SKILL.md"
    ]);
  });

  it("does not overwrite existing Claude Code pack without force", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-skip-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const skillPath = join(home, ".claude", "skills", "possum-verify", "SKILL.md");
    await writeFile(skillPath, "custom skill", "utf8");
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code"]);

    await expect(readFile(skillPath, "utf8")).resolves.toBe("custom skill");
    expect(output).toEqual([
      "Skipped existing Claude Code skill with different content:",
      "- ~/.claude/skills/possum-verify/SKILL.md",
      "",
      "Re-run with --force to overwrite."
    ]);
  });

  it("overwrites existing Claude Code pack with force", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-cli-agent-force-"));
    const home = await mkdtemp(join(tmpdir(), "possum-cli-agent-home-"));
    const output: string[] = [];
    const skillPath = join(root, ".claude", "skills", "possum-verify", "SKILL.md");
    await writeFile(skillPath, "custom project skill", "utf8");
    const program = buildProgram({ cwd: root, homeDir: home, stdout: (line) => output.push(line) });

    await program.parseAsync(["node", "possum", "agent", "install", "claude-code", "--project", "--force"]);

    await expect(readFile(skillPath, "utf8")).resolves.toContain("possum verify-feature --brief");
    expect(output).toEqual([
      "Overwrote project Claude Code Possum verification skill:",
      "- .claude/skills/possum-verify/SKILL.md"
    ]);
  });
```

- [ ] **Step 2: Run CLI tests and verify they fail because the command does not exist**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/cli.test.ts
```

Expected: FAIL with Commander reporting unknown command `agent` or TypeScript reporting `homeDir` is not part of `CliDependencies`.

- [ ] **Step 3: Add CLI imports**

Modify imports at the top of `src/cli/main.ts`:

```ts
import { homedir } from "node:os";
import {
  ClaudeCodePackInstallStatus,
  ClaudeCodePackScope,
  installClaudeCodeVerificationPack,
  InstallClaudeCodeVerificationPackResult
} from "../agents/claudeCodePack.js";
```

Keep existing imports intact.

- [ ] **Step 4: Add `homeDir` dependency injection**

In `src/cli/main.ts`, add `homeDir?: string;` to `CliDependencies`:

```ts
export interface CliDependencies {
  cwd: string;
  homeDir?: string;
  stdout: (line: string) => void;
  stderr?: (line: string) => void;
  execFile?: ReplayExecFile;
  now?: Date;
  setExitCode?: (code: number) => void;
  runAuditImpl?: typeof runAudit;
  verifyAppImpl?: typeof verifyApp;
  verifyFeatureImpl?: VerifyFeatureImpl;
  recordAuthSessionImpl?: RecordAuthSessionImpl;
  collectGitDiffImpl?: CollectGitDiffImpl;
  inferFeatureBriefFromDiffImpl?: InferFeatureBriefFromDiffImpl;
  resolveFeatureVerification?: (target: ResolvedAuditTarget) => ResolvedFeatureVerificationCliConfig;
}
```

- [ ] **Step 5: Add nested agent install command**

In `buildProgram()`, after the `init` command and before the `auth` command, add:

```ts
  const agentCommand = program.command("agent").description("Install coding agent integrations.");
  const agentInstallCommand = agentCommand.command("install").description("Install an agent integration pack.");

  agentInstallCommand
    .command("claude-code")
    .description("Install the Claude Code Possum verification skill.")
    .option("--project", "Install into this project instead of ~/.claude")
    .option("--force", "Overwrite an existing possum-verify skill")
    .action(async (options: { force?: boolean; project?: boolean }) => {
      const result = await installClaudeCodeVerificationPack({
        rootDir: deps.cwd,
        homeDir: deps.homeDir ?? homedir(),
        scope: options.project ? "project" : "global",
        force: options.force
      });

      for (const line of formatClaudeCodePackInstallOutput(result)) {
        deps.stdout(line);
      }
    });
```

- [ ] **Step 6: Add CLI output formatter helpers**

In `src/cli/main.ts`, near other helper functions, add:

```ts
function formatClaudeCodePackInstallOutput(result: InstallClaudeCodeVerificationPackResult): string[] {
  const scopeLabel = result.scope === "global" ? "global" : "project";
  const displayPath = getClaudeCodePackDisplayPath(result.scope);

  if (result.status === "skipped") {
    return [
      "Skipped existing Claude Code skill with different content:",
      `- ${displayPath}`,
      "",
      "Re-run with --force to overwrite."
    ];
  }

  if (result.status === "unchanged") {
    return ["Claude Code Possum verification skill already up to date:", `- ${displayPath}`];
  }

  const verb = result.status === "overwritten" ? "Overwrote" : "Installed";
  const lines = [`${verb} ${scopeLabel} Claude Code Possum verification skill:`, `- ${displayPath}`];

  if (result.scope === "global" && result.status === "installed") {
    lines.push(
      "",
      "Next steps:",
      "- Restart Claude Code if ~/.claude/skills did not exist when the session started.",
      "- Ask Claude Code to use /possum-verify after customer-facing changes."
    );
  }

  return lines;
}

function getClaudeCodePackDisplayPath(scope: ClaudeCodePackScope): string {
  return scope === "global"
    ? "~/.claude/skills/possum-verify/SKILL.md"
    : ".claude/skills/possum-verify/SKILL.md";
}
```

If `ClaudeCodePackInstallStatus` is unused after adding this helper, remove that imported type.

- [ ] **Step 7: Run CLI tests and verify they pass**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/cli.test.ts
```

Expected: PASS for `tests/cli.test.ts`.

- [ ] **Step 8: Run typecheck**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 9: Commit CLI command**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy git add src/cli/main.ts tests/cli.test.ts
/home/yathu/.headroom/bin/rtk proxy git commit -m "feat: install claude code verification pack from cli"
```

Expected: commit succeeds.

---

### Task 3: Document Claude Code verification pack

**Files:**
- Modify: `README.md`
- Modify: `docs/agents/claude-code.md`

**Interfaces:**
- Consumes from Task 2:
  - `possum agent install claude-code`
  - `possum agent install claude-code --project`
  - `--force`

- [ ] **Step 1: Update README Claude Code integration section**

In `README.md`, under `## Coding Agent Integration`, add this subsection before the workflow description:

```md
### Claude Code Verification Pack

Install Possum's Claude Code skill globally so Claude knows Possum exists across projects:

```bash
possum agent install claude-code
```

This writes:

```text
~/.claude/skills/possum-verify/SKILL.md
```

For a repository-local skill that can be checked into a project, run:

```bash
possum agent install claude-code --project
```

This writes:

```text
.claude/skills/possum-verify/SKILL.md
```

The installer is non-destructive. If a different `possum-verify` skill already exists, Possum skips it unless you pass `--force`.
```

- [ ] **Step 2: Update Claude Code agent doc setup**

Replace the `## Claude Code Instruction` section in `docs/agents/claude-code.md` with:

```md
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
```

Keep the existing CLI Workflow, MCP Workflow, and Good Trigger Examples sections.

- [ ] **Step 3: Run docs grep checks**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy grep -n "agent install claude-code" README.md docs/agents/claude-code.md
/home/yathu/.headroom/bin/rtk proxy grep -n "hooks" docs/superpowers/specs/2026-06-28-claude-code-verification-pack-design.md README.md docs/agents/claude-code.md
```

Expected: first command shows installer references in both docs. Second command must not show instructions to install or enable hooks; it may show the spec non-goal that hooks are out of scope.

- [ ] **Step 4: Run full verification**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm run typecheck
/home/yathu/.headroom/bin/rtk proxy npm test
/home/yathu/.headroom/bin/rtk proxy npm run build
/home/yathu/.headroom/bin/rtk proxy git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Commit docs**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy git add README.md docs/agents/claude-code.md
/home/yathu/.headroom/bin/rtk proxy git commit -m "docs: describe claude code verification pack"
```

Expected: commit succeeds.

---

## Plan Self-Review

- Spec coverage: covered global default install, project install, non-destructive behavior, `--force`, generated skill content, CLI shape, docs, tests, and hooks out of scope.
- Placeholder scan: no placeholder steps remain; all code-producing steps include exact code snippets or exact text blocks.
- Type consistency: installer types use `ClaudeCodePackScope`, `ClaudeCodePackInstallStatus`, and `InstallClaudeCodeVerificationPackResult` consistently across module, CLI, and tests.
- Scope check: the plan implements one integration pack and does not include hooks, MCP configuration, auth changes, or browser verification changes.
