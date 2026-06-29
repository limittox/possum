import { describe, expect, it } from "vitest";
import { RunReport } from "../src/contracts/findings.js";
import { renderRunHtml } from "../src/report/renderHtml.js";

function report(overrides: Partial<RunReport> = {}): RunReport {
  return {
    runType: "audit",
    runId: "run_20260628_120000",
    targetUrl: "http://localhost:3000",
    startedAt: "2026-06-28T12:00:00.000Z",
    completedAt: "2026-06-28T12:01:00.000Z",
    personas: ["beginner", "impatient"],
    diagnostics: [{ phase: "claims", status: "inconclusive", reason: "provider timed out" }],
    findings: [
      {
        id: "finding_beginner_dead_end_001",
        runId: "run_20260628_120000",
        persona: "beginner",
        severity: "high",
        confidence: "confirmed",
        mission: "Find the primary call to action.",
        expected: "A customer can continue from the first screen.",
        actual: "No usable action was available.",
        reproducibility: { status: "reproduced", attempts: 1 },
        evidence: {
          screenshots: ["personas/beginner/screenshots/first-page.png"],
          trace: "findings/finding_beginner_dead_end_001/trace.json",
          repro: "findings/finding_beginner_dead_end_001/repro.spec.ts"
        },
        dedupeFingerprint: "beginner:dead-end"
      }
    ],
    ...overrides
  };
}

describe("renderRunHtml", () => {
  it("renders run summary, diagnostics, findings, screenshots, and artifact links", () => {
    const html = renderRunHtml(report());

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Possum Audit run_20260628_120000");
    expect(html).toContain("http://localhost:3000");
    expect(html).toContain("1 confirmed finding");
    expect(html).toContain("Claims: inconclusive — provider timed out");
    expect(html).toContain("finding_beginner_dead_end_001");
    expect(html).toContain("Find the primary call to action.");
    expect(html).toContain("npx playwright test findings/finding_beginner_dead_end_001/repro.spec.ts");
    expect(html).toContain('href="findings/finding_beginner_dead_end_001/trace.json"');
    expect(html).toContain('href="findings/finding_beginner_dead_end_001/debug.json"');
    expect(html).toContain('href="findings/finding_beginner_dead_end_001/repair-hints.md"');
    expect(html).toContain('src="personas/beginner/screenshots/first-page.png"');
    expect(html).toContain('href="findings.json"');
    expect(html).toContain('href="verification.json"');
  });

  it("escapes unsafe report and finding content", () => {
    const html = renderRunHtml(
      report({
        targetUrl: "http://localhost:3000/?q=<script>alert(1)</script>",
        findings: [
          {
            id: "finding_feature_check_001",
            runId: "run_20260628_120000",
            persona: "feature",
            severity: "high",
            confidence: "confirmed",
            mission: "Click <script>alert(1)</script>",
            expected: "Expected <b>safe</b> behavior.",
            actual: "Rendered <img src=x onerror=alert(1)>.",
            reproducibility: { status: "reproduced", attempts: 1 },
            evidence: {
              screenshots: [],
              trace: "findings/finding_feature_check_001/trace.json",
              repro: "findings/finding_feature_check_001/repro.spec.ts"
            },
            dedupeFingerprint: "feature:unsafe"
          }
        ]
      })
    );

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>safe</b>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;b&gt;safe&lt;/b&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});
