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
