import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, "custom skill", "utf8");

    const result = await installClaudeCodeVerificationPack({ rootDir, homeDir });

    expect(result.status).toBe("skipped");
    await expect(readFile(skillPath, "utf8")).resolves.toBe("custom skill");
  });

  it("overwrites existing different content with force", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-pack-force-"));
    const homeDir = await mkdtemp(join(tmpdir(), "possum-pack-home-"));
    const skillPath = getClaudeCodePossumSkillPath({ rootDir, homeDir, scope: "project" });
    await mkdir(dirname(skillPath), { recursive: true });
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
