import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PersonaSchema, PossumConfigSchema } from "../src/contracts/config.js";
import { resolveAuditTarget } from "../src/config/appConfig.js";

describe("PossumConfigSchema v1.1 app config", () => {
  it("accepts minimal local target config without model settings", () => {
    const parsed = PossumConfigSchema.parse({
      target: {
        url: "http://localhost:3000"
      }
    });

    expect(parsed.target.url).toBe("http://localhost:3000");
    expect(parsed.target.command).toBeUndefined();
    expect(parsed.personas).toEqual(["beginner", "impatient", "hostile"]);
  });

  it("accepts target.command as the optional startup command", () => {
    const parsed = PossumConfigSchema.parse({
      target: {
        url: "http://localhost:3000",
        command: "npm run dev"
      }
    });

    expect(parsed.target.command).toBe("npm run dev");
  });

  it("accepts auth storage state config", () => {
    const parsed = PossumConfigSchema.parse({
      target: { url: "http://localhost:3000" },
      auth: { storageState: ".possum/auth/default.json" }
    });

    expect(parsed.auth?.storageState).toBe(".possum/auth/default.json");
  });

  it("resolves configured auth storage state relative to the project root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "possum-auth-config-"));
    await writeFile(
      join(dir, "possum.config.json"),
      JSON.stringify({
        target: { url: "http://localhost:3000" },
        auth: { storageState: ".possum/auth/default.json" }
      }),
      "utf8"
    );

    const resolved = await resolveAuditTarget({ rootDir: dir });

    expect(resolved.authStorageState).toBe(join(dir, ".possum/auth/default.json"));
  });

  it("accepts the claims evaluation agent as a persona value", () => {
    expect(PersonaSchema.parse("claims")).toBe("claims");
  });

  it("returns the models block from config when present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "possum-models-"));
    await writeFile(
      join(dir, "possum.config.json"),
      JSON.stringify({ target: { url: "http://localhost:3000" }, models: { provider: "anthropic", personaModel: "m" } })
    );

    const resolved = await resolveAuditTarget({ rootDir: dir });
    expect(resolved.models).toEqual({ provider: "anthropic", personaModel: "m" });
  });

  it("defaults request timeout and persona wall-clock budgets", () => {
    const parsed = PossumConfigSchema.parse({
      target: { url: "http://localhost:3000" }
    });

    expect(parsed.budgets).toEqual({
      maxStepsPerPersona: 30,
      maxMinutesPerPersona: 5,
      requestTimeoutSeconds: 60
    });
  });

  it("accepts request timeout budget override", () => {
    const parsed = PossumConfigSchema.parse({
      target: { url: "http://localhost:3000" },
      budgets: {
        maxStepsPerPersona: 12,
        maxMinutesPerPersona: 2,
        requestTimeoutSeconds: 7
      }
    });

    expect(parsed.budgets).toEqual({
      maxStepsPerPersona: 12,
      maxMinutesPerPersona: 2,
      requestTimeoutSeconds: 7
    });
  });

  it("resolves claim timeout and wall-clock budgets from config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "possum-budget-config-"));
    await writeFile(
      join(dir, "possum.config.json"),
      JSON.stringify({
        target: { url: "http://localhost:3000" },
        budgets: {
          maxStepsPerPersona: 11,
          maxMinutesPerPersona: 3,
          requestTimeoutSeconds: 9
        },
        models: { provider: "openrouter", personaModel: "openai/gpt-4o" }
      }),
      "utf8"
    );

    const resolved = await resolveAuditTarget({ rootDir: dir });

    expect(resolved.maxStepsPerPersona).toBe(11);
    expect(resolved.maxMinutesPerPersona).toBe(3);
    expect(resolved.requestTimeoutSeconds).toBe(9);
  });
});
