import { describe, expect, it } from "vitest";
import { inferFeatureBriefFromDiff } from "../src/verification/diffInference.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

const diff = {
  source: "working-tree" as const,
  diff: "diff --git a/app/page.tsx b/app/page.tsx\n+<a>Get the app</a>\n",
  changedFiles: ["app/page.tsx"]
};

describe("inferFeatureBriefFromDiff", () => {
  it("parses a generated feature verification brief", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({
        feature: "Homepage adds a Get the app CTA",
        pages: ["/"],
        setup: [],
        checks: [{ text: "The homepage shows a Get the app call to action", hints: { expectedText: "Get the app" } }]
      })
    ]);

    const brief = await inferFeatureBriefFromDiff({ diff, llm, model: "test-model" });

    expect(brief).toEqual({
      feature: "Homepage adds a Get the app CTA",
      pages: ["/"],
      setup: [],
      checks: [{ text: "The homepage shows a Get the app call to action", hints: { expectedText: "Get the app" } }]
    });
    expect(llm.requests[0]).toMatchObject({ model: "test-model" });
    expect(llm.requests[0].prompt).toContain("Changed files:\n- app/page.tsx");
    expect(llm.requests[0].prompt).toContain("Diff source: working-tree");
  });

  it("truncates large diffs before sending them to the model", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ feature: "Short feature", pages: [], setup: [], checks: [{ text: "A browser-visible check" }] })
    ]);

    await inferFeatureBriefFromDiff({
      diff: { ...diff, diff: "a".repeat(200) },
      llm,
      model: "test-model",
      maxDiffChars: 25
    });

    expect(llm.requests[0].prompt).toContain("aaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(llm.requests[0].prompt).toContain("[diff truncated at 25 characters]");
    expect(llm.requests[0].prompt).not.toContain("a".repeat(26));
  });

  it("throws a helpful error when the model does not return a valid brief", async () => {
    const llm = new ScriptedLlmClient([JSON.stringify({ feature: "Missing checks" })]);

    await expect(inferFeatureBriefFromDiff({ diff, llm, model: "test-model" })).rejects.toThrow(
      "Could not infer feature brief from git diff"
    );
  });
});
