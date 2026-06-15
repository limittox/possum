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
});
