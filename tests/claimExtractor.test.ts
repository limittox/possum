import { describe, expect, it } from "vitest";
import { extractClaimsFromMarkdown, normalizeClaimText } from "../src/audit/claimExtractor.js";

describe("claim extraction", () => {
  it("normalizes claim text for evidence output", () => {
    expect(normalizeClaimText("  Create\n\nprojects\tin minutes.  ")).toBe("Create projects in minutes.");
  });

  it("extracts product claims from README markdown", () => {
    const claims = extractClaimsFromMarkdown(`# Project Pilot

Project Pilot helps teams create projects in minutes.

## Install

\`\`\`bash
npm install
\`\`\`

## Why teams use it

Invite your team without setup.
`);

    expect(claims).toEqual([
      { source: "readme", text: "Project Pilot" },
      { source: "readme", text: "Project Pilot helps teams create projects in minutes." },
      { source: "readme", text: "Invite your team without setup." }
    ]);
  });
});
