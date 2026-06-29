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
