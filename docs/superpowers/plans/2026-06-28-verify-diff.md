# Verify Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `possum verify-diff`, which infers a feature verification brief from git changes, saves the generated brief, and automatically runs the existing feature verification engine.

**Architecture:** Keep `verify-diff` as orchestration over existing `verify-feature`. Add a focused diff collection module, a focused LLM inference module, then wire a CLI command that resolves target config, collects diff text, infers a `FeatureVerificationBrief`, runs `runFeatureVerification`, and writes `diff-brief.json` into the run directory.

**Tech Stack:** TypeScript, Node.js `child_process.execFile`, Commander, Zod, existing Possum LLM client and feature verification types.

## Global Constraints

- Work inline in `/home/yathu/code/possum`; do not create a worktree.
- Use existing `runFeatureVerification`; do not create a second browser verification engine.
- `verify-diff` must require configured models, like `verify-feature`.
- Default diff behavior: prefer uncommitted changes; otherwise compare against `origin/main`, then `main`.
- Keep generated brief auditable by writing `diff-brief.json` to the run directory.
- Add `--base`, `--brief-out`, `--no-run`, `--url`, and `--command` CLI options.
- No GitHub API integration in MVP.

---

## File Structure

- Create `src/diff/gitDiff.ts`
  - Owns git command execution and diff source selection.
  - Exports `collectGitDiff(input: CollectGitDiffInput): Promise<GitDiffSummary>`.

- Create `src/verification/diffInference.ts`
  - Owns prompt construction and parsing for `FeatureVerificationBrief` generated from git diff.
  - Exports `inferFeatureBriefFromDiff(input: InferFeatureBriefFromDiffInput): Promise<FeatureVerificationBrief>`.

- Modify `src/cli/main.ts`
  - Adds `verify-diff` command.
  - Adds dependency injection hooks for tests.
  - Writes generated brief artifact and optionally runs feature verification.

- Modify `src/index.ts`
  - Export new public modules if current export pattern expects all core utilities to be available.

- Add tests:
  - `tests/gitDiff.test.ts`
  - `tests/diffInference.test.ts`
  - Extend `tests/cli.test.ts`

---

### Task 1: Git Diff Collection

**Files:**
- Create: `src/diff/gitDiff.ts`
- Test: `tests/gitDiff.test.ts`

**Interfaces:**
- Produces:
  - `interface GitDiffSummary { source: string; base?: string; diff: string; changedFiles: string[] }`
  - `interface CollectGitDiffInput { rootDir: string; base?: string; execFile?: ExecFileFn }`
  - `function collectGitDiff(input: CollectGitDiffInput): Promise<GitDiffSummary>`

- [ ] **Step 1: Write failing tests**

Create `tests/gitDiff.test.ts` with tests for:

```ts
import { describe, expect, it } from "vitest";
import { collectGitDiff, ExecFileFn } from "../src/diff/gitDiff.js";

function scriptedExecFile(responses: Record<string, { stdout?: string; stderr?: string; error?: Error }>): ExecFileFn {
  return async (file, args) => {
    const key = `${file} ${args.join(" ")}`;
    const response = responses[key];
    if (!response) {
      throw new Error(`unexpected command: ${key}`);
    }
    if (response.error) {
      throw response.error;
    }
    return { stdout: response.stdout ?? "", stderr: response.stderr ?? "" };
  };
}

describe("collectGitDiff", () => {
  it("uses uncommitted diff when present", async () => {
    const result = await collectGitDiff({
      rootDir: "/repo",
      execFile: scriptedExecFile({
        "git diff --name-only": { stdout: "src/page.tsx\n" },
        "git diff -- src/page.tsx": { stdout: "diff --git a/src/page.tsx b/src/page.tsx\n+<button>Get the app</button>\n" }
      })
    });

    expect(result).toEqual({
      source: "working-tree",
      diff: "diff --git a/src/page.tsx b/src/page.tsx\n+<button>Get the app</button>\n",
      changedFiles: ["src/page.tsx"]
    });
  });

  it("uses explicit base when supplied", async () => {
    const result = await collectGitDiff({
      rootDir: "/repo",
      base: "main",
      execFile: scriptedExecFile({
        "git diff --name-only main...HEAD": { stdout: "README.md\napp/page.tsx\n" },
        "git diff main...HEAD -- README.md app/page.tsx": { stdout: "diff body" }
      })
    });

    expect(result).toEqual({
      source: "base",
      base: "main",
      diff: "diff body",
      changedFiles: ["README.md", "app/page.tsx"]
    });
  });

  it("falls back to origin/main when working tree has no changes", async () => {
    const result = await collectGitDiff({
      rootDir: "/repo",
      execFile: scriptedExecFile({
        "git diff --name-only": { stdout: "" },
        "git diff --name-only origin/main...HEAD": { stdout: "src/home.tsx\n" },
        "git diff origin/main...HEAD -- src/home.tsx": { stdout: "origin diff" }
      })
    });

    expect(result.source).toBe("base");
    expect(result.base).toBe("origin/main");
    expect(result.diff).toBe("origin diff");
  });

  it("throws when no diff is available", async () => {
    await expect(
      collectGitDiff({
        rootDir: "/repo",
        execFile: scriptedExecFile({
          "git diff --name-only": { stdout: "" },
          "git diff --name-only origin/main...HEAD": { stdout: "" },
          "git diff --name-only main...HEAD": { stdout: "" }
        })
      })
    ).rejects.toThrow("No git diff found to verify.");
  });
});
```

- [ ] **Step 2: Run red tests**

Run:

```bash
npm test -- tests/gitDiff.test.ts
```

Expected: fail because `src/diff/gitDiff.ts` does not exist.

- [ ] **Step 3: Implement minimal diff collector**

Create `src/diff/gitDiff.ts`:

```ts
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

export type ExecFileFn = (file: string, args: string[], options: { cwd: string }) => Promise<{ stdout: string; stderr: string }>;

export interface CollectGitDiffInput {
  rootDir: string;
  base?: string;
  execFile?: ExecFileFn;
}

export interface GitDiffSummary {
  source: "working-tree" | "base";
  base?: string;
  diff: string;
  changedFiles: string[];
}

const defaultExecFile: ExecFileFn = async (file, args, options) => {
  const execFile = promisify(nodeExecFile);
  const result = await execFile(file, args, { cwd: options.cwd, maxBuffer: 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

export async function collectGitDiff(input: CollectGitDiffInput): Promise<GitDiffSummary> {
  const execFile = input.execFile ?? defaultExecFile;
  if (input.base) {
    return collectBaseDiff(input.rootDir, input.base, execFile);
  }

  const workingFiles = await changedFiles(input.rootDir, ["diff", "--name-only"], execFile);
  if (workingFiles.length > 0) {
    const diff = await gitStdout(input.rootDir, ["diff", "--", ...workingFiles], execFile);
    return { source: "working-tree", diff, changedFiles: workingFiles };
  }

  for (const base of ["origin/main", "main"]) {
    const files = await changedFiles(input.rootDir, ["diff", "--name-only", `${base}...HEAD`], execFile).catch(() => []);
    if (files.length > 0) {
      const diff = await gitStdout(input.rootDir, ["diff", `${base}...HEAD`, "--", ...files], execFile);
      return { source: "base", base, diff, changedFiles: files };
    }
  }

  throw new Error("No git diff found to verify.");
}

async function collectBaseDiff(rootDir: string, base: string, execFile: ExecFileFn): Promise<GitDiffSummary> {
  const files = await changedFiles(rootDir, ["diff", "--name-only", `${base}...HEAD`], execFile);
  if (files.length === 0) {
    throw new Error(`No git diff found to verify against ${base}.`);
  }
  const diff = await gitStdout(rootDir, ["diff", `${base}...HEAD`, "--", ...files], execFile);
  return { source: "base", base, diff, changedFiles: files };
}

async function changedFiles(rootDir: string, args: string[], execFile: ExecFileFn): Promise<string[]> {
  const stdout = await gitStdout(rootDir, args, execFile);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function gitStdout(rootDir: string, args: string[], execFile: ExecFileFn): Promise<string> {
  const result = await execFile("git", args, { cwd: rootDir });
  return result.stdout;
}
```

- [ ] **Step 4: Run green tests**

Run:

```bash
npm test -- tests/gitDiff.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/diff/gitDiff.ts tests/gitDiff.test.ts
git commit -m "feat: collect git diff for verification"
```

---

### Task 2: Diff-to-Brief Inference

**Files:**
- Create: `src/verification/diffInference.ts`
- Test: `tests/diffInference.test.ts`

**Interfaces:**
- Consumes: `GitDiffSummary` from Task 1.
- Produces:
  - `interface InferFeatureBriefFromDiffInput { diff: GitDiffSummary; llm: LlmClient; model: string; maxDiffChars?: number }`
  - `function inferFeatureBriefFromDiff(input): Promise<FeatureVerificationBrief>`

- [ ] **Step 1: Write failing tests**

Create `tests/diffInference.test.ts` with tests for valid inference, truncation, and parse errors.

- [ ] **Step 2: Run red tests**

```bash
npm test -- tests/diffInference.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement inference module**

Implement LLM call that returns only JSON matching `FeatureVerificationBriefSchema`. Prompt should include changed files, diff source/base, and truncated diff. Enforce browser-visible checks only.

- [ ] **Step 4: Run green tests**

```bash
npm test -- tests/diffInference.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/verification/diffInference.ts tests/diffInference.test.ts
git commit -m "feat: infer feature brief from git diff"
```

---

### Task 3: CLI `verify-diff`

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `tests/cli.test.ts`

**Interfaces:**
- Consumes:
  - `collectGitDiff()`
  - `inferFeatureBriefFromDiff()`
  - existing `runFeatureVerification()`
- Produces CLI:
  - `possum verify-diff [--base <base>] [--url <url>] [--command <command>] [--brief-out <path>] [--no-run]`

- [ ] **Step 1: Write failing CLI tests**

Extend `tests/cli.test.ts` to verify:

1. `verify-diff` calls diff collector, infers brief, runs feature verification, writes `diff-brief.json` in the run dir, and prints report/verification paths.
2. `--brief-out` writes generated brief to requested path.
3. `--no-run` writes the brief but does not run verification.
4. Missing model config throws `Diff verification requires models in possum.config.json.`

- [ ] **Step 2: Run red CLI tests**

```bash
npm test -- tests/cli.test.ts -t "verify-diff"
```

Expected: fail because command does not exist.

- [ ] **Step 3: Implement CLI command**

Add dependency injection hooks in `CliDependencies`:

```ts
collectGitDiffImpl?: typeof collectGitDiff;
inferFeatureBriefFromDiffImpl?: typeof inferFeatureBriefFromDiff;
writeFile?: typeof import("node:fs/promises").writeFile;
```

Command behavior:

- Resolve target with existing `resolveAuditTarget`.
- Resolve feature verification models with existing `resolveFeatureVerificationFromTarget`.
- Collect diff.
- Infer brief.
- If `--brief-out`, write generated brief there.
- If `--no-run`, print `Generated feature brief: <path>` and return.
- Else run `runFeatureVerification` with generated brief.
- Write `.possum/runs/<runId>/diff-brief.json`.
- Print run id, report, verification, and generated brief path.

- [ ] **Step 4: Run green CLI tests**

```bash
npm test -- tests/cli.test.ts -t "verify-diff"
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/main.ts tests/cli.test.ts
git commit -m "feat: add verify-diff cli"
```

---

### Task 4: Public Exports and Documentation

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`
- Test: existing typecheck/build

**Interfaces:**
- Exports `collectGitDiff` and `inferFeatureBriefFromDiff` if consistent with project export conventions.

- [ ] **Step 1: Update README**

Add a short section:

```md
## Diff Verification

Use `possum verify-diff` after changing user-facing behavior. Possum reads git changes, infers a feature brief, saves it, and runs feature verification.

```bash
possum verify-diff
possum verify-diff --base main
possum verify-diff --brief-out feature.generated.json --no-run
```
```

- [ ] **Step 2: Run verification**

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add README.md src/index.ts
git commit -m "docs: describe verify-diff workflow"
```
