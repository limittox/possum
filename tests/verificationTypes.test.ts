import { describe, expect, it } from "vitest";
import { FeatureVerificationBriefSchema, normalizeFeatureChecks } from "../src/verification/types.js";

describe("FeatureVerificationBriefSchema", () => {
  it("parses a minimal feature brief", () => {
    const parsed = FeatureVerificationBriefSchema.parse({
      feature: "Added CSV export to reports"
    });

    expect(parsed).toEqual({
      feature: "Added CSV export to reports",
      pages: [],
      setup: [],
      checks: []
    });
  });

  it("parses explicit checks with hints", () => {
    const parsed = FeatureVerificationBriefSchema.parse({
      feature: "Added CSV export to reports",
      pages: ["/reports"],
      setup: ["Open the Reports page"],
      checks: [
        {
          text: "Click Export CSV and confirm a CSV downloads",
          hints: { clickText: "Export CSV", expectedDownload: ".csv" }
        }
      ]
    });

    expect(parsed.checks[0]).toEqual({
      text: "Click Export CSV and confirm a CSV downloads",
      hints: { clickText: "Export CSV", expectedDownload: ".csv" }
    });
  });

  it("rejects an empty feature description", () => {
    expect(() => FeatureVerificationBriefSchema.parse({ feature: "" })).toThrow(/feature/);
  });
});

describe("normalizeFeatureChecks", () => {
  it("marks explicit checks as explicit", () => {
    const brief = FeatureVerificationBriefSchema.parse({
      feature: "Added CSV export to reports",
      pages: ["/reports"],
      checks: [{ text: "CSV download starts", hints: { clickText: "Export CSV" } }]
    });

    expect(normalizeFeatureChecks(brief)).toEqual([
      {
        id: "check_1",
        source: "explicit",
        text: "CSV download starts",
        pages: ["/reports"],
        hints: { clickText: "Export CSV" }
      }
    ]);
  });

  it("marks inferred checks as inferred and appends after explicit checks", () => {
    const brief = FeatureVerificationBriefSchema.parse({
      feature: "Added CSV export to reports",
      pages: ["/reports"],
      checks: [{ text: "CSV download starts" }]
    });

    expect(
      normalizeFeatureChecks(brief, [
        { text: "Downloaded CSV contains visible rows", hints: { expectedDownload: ".csv" } }
      ])
    ).toEqual([
      {
        id: "check_1",
        source: "explicit",
        text: "CSV download starts",
        pages: ["/reports"],
        hints: undefined
      },
      {
        id: "check_2",
        source: "inferred",
        text: "Downloaded CSV contains visible rows",
        pages: ["/reports"],
        hints: { expectedDownload: ".csv" }
      }
    ]);
  });

  it("caps inferred checks at three", () => {
    const brief = FeatureVerificationBriefSchema.parse({ feature: "Added CSV export to reports" });

    expect(
      normalizeFeatureChecks(brief, [
        { text: "check one" },
        { text: "check two" },
        { text: "check three" },
        { text: "check four" }
      ]).map((check) => check.text)
    ).toEqual(["check one", "check two", "check three"]);
  });
});
