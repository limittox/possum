import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";
import { FeatureCheckInferenceError, inferFeatureChecks } from "../src/verification/checkInference.js";
import { FeatureVerificationBriefSchema } from "../src/verification/types.js";

describe("inferFeatureChecks", () => {
  it("infers checks from feature brief", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([
        { text: "Export CSV button is visible on Reports", hints: { page: "/reports" } },
        { text: "Click Export CSV and confirm a CSV downloads", hints: { clickText: "Export CSV", expectedDownload: ".csv" } }
      ])
    ]);

    const checks = await inferFeatureChecks({
      brief: FeatureVerificationBriefSchema.parse({
        feature: "Added CSV export to reports",
        pages: ["/reports"],
        setup: ["Open Reports"]
      }),
      llm,
      model: "planner-model"
    });

    expect(checks).toEqual([
      { text: "Export CSV button is visible on Reports", hints: { page: "/reports" } },
      { text: "Click Export CSV and confirm a CSV downloads", hints: { clickText: "Export CSV", expectedDownload: ".csv" } }
    ]);
    expect(llm.requests[0].prompt).toContain("Added CSV export to reports");
    expect(llm.requests[0].prompt).toContain("/reports");
  });

  it("caps inferred checks at three", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ text: "one" }, { text: "two" }, { text: "three" }, { text: "four" }])
    ]);

    const checks = await inferFeatureChecks({
      brief: FeatureVerificationBriefSchema.parse({ feature: "Added CSV export" }),
      llm,
      model: "planner-model"
    });

    expect(checks.map((check) => check.text)).toEqual(["one", "two", "three"]);
  });

  it("throws FeatureCheckInferenceError for invalid model output", async () => {
    const llm = new ScriptedLlmClient(["not json"]);

    await expect(
      inferFeatureChecks({
        brief: FeatureVerificationBriefSchema.parse({ feature: "Added CSV export" }),
        llm,
        model: "planner-model"
      })
    ).rejects.toBeInstanceOf(FeatureCheckInferenceError);
  });
});
