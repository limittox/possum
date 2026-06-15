import { describe, expect, it } from "vitest";
import { triageClaims } from "../src/audit/claimTriage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

describe("triageClaims", () => {
  it("keeps only UI-verifiable claims with expected behavior", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([
        { index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." },
        { index: 1, verifiable: false, expectedBehavior: "" }
      ])
    ]);

    const triaged = await triageClaims({
      claims: [
        { source: "homepage", text: "Export your report as PDF" },
        { source: "readme", text: "Licensed under Apache-2.0" }
      ],
      llm,
      model: "judge-model"
    });

    expect(triaged).toEqual([
      {
        claim: { source: "homepage", text: "Export your report as PDF" },
        expectedBehavior: "An export-to-PDF control is reachable."
      }
    ]);
  });

  it("returns no claims when the model response cannot be parsed", async () => {
    const llm = new ScriptedLlmClient(["not json"]);
    const triaged = await triageClaims({
      claims: [{ source: "homepage", text: "Export your report as PDF" }],
      llm,
      model: "judge-model"
    });
    expect(triaged).toEqual([]);
  });

  it("returns no claims and makes no model call for an empty claim list", async () => {
    const llm = new ScriptedLlmClient([]);
    const triaged = await triageClaims({ claims: [], llm, model: "judge-model" });
    expect(triaged).toEqual([]);
    expect(llm.requests).toHaveLength(0);
  });
});
