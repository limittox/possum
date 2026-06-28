import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getAuthStorageStatePath,
  recordAuthSession,
  updateDefaultAuthConfig
} from "../src/auth/sessionRecorder.js";

describe("auth session recorder", () => {
  it("resolves default and named auth storage state paths", () => {
    const root = "/repo";

    expect(getAuthStorageStatePath(root)).toBe(join(root, ".possum/auth/default.json"));
    expect(getAuthStorageStatePath(root, "admin")).toBe(join(root, ".possum/auth/admin.json"));
  });

  it("rejects unsafe auth profile names", () => {
    expect(() => getAuthStorageStatePath("/repo", "../admin")).toThrow(/Invalid auth profile name/);
    expect(() => getAuthStorageStatePath("/repo", "admin/token")).toThrow(/Invalid auth profile name/);
  });

  it("records browser storage state after the user completes login", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-auth-record-"));
    const page = { goto: vi.fn(async () => undefined) };
    const context = {
      newPage: vi.fn(async () => page),
      storageState: vi.fn(async () => undefined)
    };
    const browser = {
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined)
    };
    const output: string[] = [];
    let waited = false;

    const result = await recordAuthSession({
      rootDir: root,
      targetUrl: "http://localhost:3000",
      name: "admin",
      launchBrowser: async () => browser,
      waitForCompletion: async () => {
        waited = true;
      },
      stdout: (line) => output.push(line)
    });

    const expectedPath = join(root, ".possum/auth/admin.json");
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith("http://localhost:3000", {
      waitUntil: "domcontentloaded",
      timeout: 30_000
    });
    expect(waited).toBe(true);
    expect(context.storageState).toHaveBeenCalledWith({ path: expectedPath });
    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ storageStatePath: expectedPath, profileName: "admin" });
    expect(output.join("\n")).toContain("Saved auth session");
  });

  it("updates possum.config.json with the default auth storage state path", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-auth-config-update-"));
    await writeFile(
      join(root, "possum.config.json"),
      JSON.stringify({ target: { url: "http://localhost:3000" } }, null, 2),
      "utf8"
    );

    const updated = await updateDefaultAuthConfig(root, join(root, ".possum/auth/default.json"));

    expect(updated).toBe(true);
    const config = JSON.parse(await readFile(join(root, "possum.config.json"), "utf8"));
    expect(config.auth).toEqual({ storageState: ".possum/auth/default.json" });
  });

  it("does not create possum.config.json when updating default auth config without an existing config", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-auth-config-missing-"));

    const updated = await updateDefaultAuthConfig(root, join(root, ".possum/auth/default.json"));

    expect(updated).toBe(false);
  });
});
