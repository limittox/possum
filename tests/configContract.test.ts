import { describe, expect, it } from "vitest";
import { PersonaSchema, PossumConfigSchema } from "../src/contracts/config.js";

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
});
