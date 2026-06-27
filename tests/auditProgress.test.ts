import { describe, expect, it } from "vitest";
import { formatProgressEvent } from "../src/cli/auditProgress.js";

describe("formatProgressEvent", () => {
  it("formats app-starting with the command", () => {
    expect(formatProgressEvent({ type: "app-starting", command: "npm run dev" })).toBe(
      "possum: starting app: npm run dev"
    );
  });

  it("formats app-ready", () => {
    expect(formatProgressEvent({ type: "app-ready" })).toBe("possum: app ready");
  });

  it("formats a phase-start line with index, total, and label", () => {
    expect(formatProgressEvent({ type: "phase-start", phase: "beginner", index: 1, total: 3 })).toBe(
      "possum: [1/3] beginner — loading first screen…"
    );
  });

  it("labels the claims phase", () => {
    expect(formatProgressEvent({ type: "phase-start", phase: "claims", index: 4, total: 4 })).toBe(
      "possum: [4/4] claims — verifying app claims…"
    );
  });

  it("formats phase-done with no findings as ok", () => {
    expect(formatProgressEvent({ type: "phase-done", phase: "impatient", index: 2, total: 3, findings: 0 })).toBe(
      "possum: [2/3] impatient — ok"
    );
  });

  it("formats phase-done with one finding singular", () => {
    expect(formatProgressEvent({ type: "phase-done", phase: "beginner", index: 1, total: 3, findings: 1 })).toBe(
      "possum: [1/3] beginner — 1 finding"
    );
  });

  it("formats phase-done with multiple findings plural", () => {
    expect(formatProgressEvent({ type: "phase-done", phase: "hostile", index: 3, total: 3, findings: 2 })).toBe(
      "possum: [3/3] hostile — 2 findings"
    );
  });

  it("formats judge-done with a tally", () => {
    expect(formatProgressEvent({ type: "judge-done", accepted: 1, candidates: 1 })).toBe(
      "possum: judge — 1/1 findings accepted"
    );
  });

  it("formats judge-done with no candidates", () => {
    expect(formatProgressEvent({ type: "judge-done", accepted: 0, candidates: 0 })).toBe(
      "possum: judge — no findings"
    );
  });

  it("formats claim-start with truncated claim label", () => {
    expect(
      formatProgressEvent({
        type: "claim-start",
        index: 1,
        total: 3,
        claim: "See an estimate, right now, without waiting for a sales person to call back"
      })
    ).toBe('possum: claim 1/3 — "See an estimate, right now, without waiting for a sales..."');
  });

  it("formats claim-step heartbeat", () => {
    expect(
      formatProgressEvent({
        type: "claim-step",
        index: 1,
        total: 3,
        attempt: 1,
        attempts: 2,
        step: 4,
        maxSteps: 30
      })
    ).toBe("possum: claim 1/3 · attempt 1/2 · step 4/30...");
  });

  it("formats claim-done verdict", () => {
    expect(
      formatProgressEvent({
        type: "claim-done",
        index: 1,
        total: 3,
        verdict: "inconclusive"
      })
    ).toBe("possum: claim 1/3 — inconclusive");
  });

  it("formats claims-truncated budget line", () => {
    expect(
      formatProgressEvent({
        type: "claims-truncated",
        processed: 2,
        total: 3
      })
    ).toBe("possum: claims — budget reached, verified 2/3 claims");
  });
});
