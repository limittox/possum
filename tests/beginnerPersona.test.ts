import { describe, expect, it } from "vitest";
import { evaluateBeginnerPersona } from "../src/personas/beginner.js";

describe("evaluateBeginnerPersona", () => {
  it("reports a dead-end first screen when no customer actions exist", () => {
    const findings = evaluateBeginnerPersona({
      runId: "run_20260613_020000",
      surface: {
        targetUrl: "http://localhost:3000",
        finalUrl: "http://localhost:3000/",
        status: 200,
        title: "Empty App",
        headings: ["Welcome"],
        links: [],
        buttons: [],
        forms: []
      }
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "finding_beginner_dead_end_001",
      persona: "beginner",
      severity: "medium",
      mission: "Find an obvious next step from the first customer-facing screen."
    });
  });

  it("does not report a dead end when a customer action exists", () => {
    const findings = evaluateBeginnerPersona({
      runId: "run_20260613_020000",
      surface: {
        targetUrl: "http://localhost:3000",
        finalUrl: "http://localhost:3000/",
        status: 200,
        title: "Actionable App",
        headings: ["Welcome"],
        links: [{ text: "Start", href: "/start" }],
        buttons: [],
        forms: []
      }
    });

    expect(findings).toEqual([]);
  });
});
