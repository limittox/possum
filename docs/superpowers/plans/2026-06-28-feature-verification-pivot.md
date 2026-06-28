# Feature Verification Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first slice of Possum's pivot into browser-based app verification for coding agents: add shared verification types/artifacts, an LLM-driven `verify-feature` workflow, and `verify-app` as the new primary wrapper for current audit behavior.

**Architecture:** Add a focused `src/verification/` module with domain types, check inference, browser verifier, and feature-verification orchestration. Reuse existing LLM clients, run store, Playwright, progress formatting style, and findings artifacts. Keep existing `audit` behavior compatible while exposing `verify-app` / `verify-feature` through CLI and MCP.

**Tech Stack:** TypeScript, NodeNext ESM, Zod v3, Vitest, Playwright, Commander, MCP SDK.

## Global Constraints

- Verification remains browser-visible behavior only; no database, API, filesystem, or source-code assertions.
- Feature verification is LLM-driven; hints guide the verifier but do not force deterministic execution.
- Feature verification may navigate only same-origin routes.
- Setup/auth instructions run as a separate setup phase; setup failure makes checks `inconclusive`, not failed.
- Check verdicts are exactly `passed`, `failed`, or `inconclusive`.
- Check sources are exactly `explicit` or `inferred`.
- Failed checks create normal Possum findings; passed and inconclusive checks stay in `verification.json` only.
- Existing `possum audit` and MCP `run_audit` remain backwards compatible.
- `verify-app` initially wraps current audit behavior; full whole-app planner is a follow-up.
- Keep inferred checks capped at three in this first slice.
- Shell commands in this repo use `rtk`; use `rtk proxy` when exact npm/git behavior is required.

---

## File Structure

### New files

- `src/verification/types.ts` — Zod schemas and TypeScript types for feature briefs, normalized checks, setup results, check results, summaries, and progress events.
- `src/verification/checkInference.ts` — LLM check inference from `feature`, `pages`, and `setup`.
- `src/verification/browserVerifier.ts` — LLM action loop over an abstract browser page.
- `src/verification/playwrightVerificationPage.ts` — Playwright implementation of the abstract verifier page.
- `src/verification/featureFindings.ts` — Convert failed feature checks into normal `Finding` records and artifacts.
- `src/verification/featureVerification.ts` — Orchestrate setup, check inference, browser execution, run artifacts, findings, and cleanup.
- `src/verification/appVerification.ts` — Thin `verifyApp()` wrapper around current `runAudit()` behavior.
- `tests/verificationTypes.test.ts`
- `tests/checkInference.test.ts`
- `tests/browserVerifier.test.ts`
- `tests/featureVerification.test.ts`
- `tests/verifyApp.test.ts`

### Modified files

- `src/contracts/config.ts` — add `feature` as a finding persona/category.
- `src/contracts/findings.ts` — add `runType` to reports.
- `src/report/renderMarkdown.ts` — render run title based on `runType`.
- `src/runs/runStore.ts` — add generic JSON artifact writer and surface `verificationJsonPath` when present.
- `src/audit/audit.ts` — accept optional `runType` override for `verify-app` wrapper.
- `src/cli/auditProgress.ts` — format feature verification progress events.
- `src/cli/main.ts` — add `verify-feature` and `verify-app`; keep `audit`.
- `src/mcp/server.ts` — add `verify_feature` and `verify_app`; keep `run_audit`.
- `README.md` — update product language and command examples.
- Existing tests touching run reports, CLI commands, MCP tool names, and contracts.

---

## Shared Interfaces Produced Across Tasks

These names are used consistently throughout the plan:

```ts
export type VerificationVerdict = "passed" | "failed" | "inconclusive";
export type VerificationCheckSource = "explicit" | "inferred";
export type FeatureSetupStatus = "skipped" | "passed" | "inconclusive";

export interface FeatureVerificationBrief {
  feature: string;
  pages: string[];
  setup: string[];
  checks: FeatureCheckBrief[];
}

export interface FeatureCheckBrief {
  text: string;
  hints?: Record<string, unknown>;
}

export interface VerificationCheck {
  id: string;
  source: VerificationCheckSource;
  text: string;
  pages: string[];
  hints?: Record<string, unknown>;
}

export interface VerificationActionRecord {
  action: string;
  detail: string;
  url?: string;
  evidence?: Record<string, unknown>;
}

export interface FeatureSetupResult {
  status: FeatureSetupStatus;
  reason?: string;
  actions: VerificationActionRecord[];
}

export interface FeatureCheckResult {
  id: string;
  source: VerificationCheckSource;
  text: string;
  verdict: VerificationVerdict;
  reason: string;
  actions: VerificationActionRecord[];
}

export interface FeatureVerificationSummary {
  runType: "feature_verification";
  feature: string;
  targetUrl: string;
  setup: FeatureSetupResult;
  checks: FeatureCheckResult[];
}
```

---

### Task 1: Run Types, Feature Persona, and Generic Run Artifacts

**Files:**
- Modify: `src/contracts/config.ts`
- Modify: `src/contracts/findings.ts`
- Modify: `src/report/renderMarkdown.ts`
- Modify: `src/runs/runStore.ts`
- Modify: `tests/contracts.test.ts`
- Modify: `tests/runStore.test.ts`

**Interfaces:**
- Produces: `RunTypeSchema`, `RunReport.runType`, `writeJsonArtifact(store, runId, relativePath, data)`.
- Consumes: Existing `RunReportSchema`, `writeRunReport`, `FindingSchema`.

- [ ] **Step 1: Add failing contract tests for run type and feature findings**

Append these tests to `tests/contracts.test.ts`:

```ts
import { FindingSchema, RunReportSchema } from "../src/contracts/findings.js";

describe("feature verification contracts", () => {
  it("accepts feature_verification run reports", () => {
    const parsed = RunReportSchema.parse({
      runType: "feature_verification",
      runId: "run_feature_1",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-28T00:00:00.000Z",
      completedAt: "2026-06-28T00:00:01.000Z",
      personas: ["feature"],
      findings: []
    });

    expect(parsed.runType).toBe("feature_verification");
  });

  it("defaults existing reports to audit run type", () => {
    const parsed = RunReportSchema.parse({
      runId: "run_audit_1",
      targetUrl: "http://localhost:3000",
      startedAt: "2026-06-28T00:00:00.000Z",
      personas: ["beginner"],
      findings: []
    });

    expect(parsed.runType).toBe("audit");
  });

  it("accepts feature findings", () => {
    const parsed = FindingSchema.parse({
      id: "finding_feature_export_csv_001",
      runId: "run_feature_1",
      persona: "feature",
      severity: "high",
      confidence: "confirmed",
      mission: "Verify completed feature behavior in the browser.",
      claim: "Click Export CSV and confirm a CSV downloads",
      expected: "A CSV download starts from the Reports page.",
      actual: "No download started after clicking Export CSV.",
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_feature_export_csv_001/trace.json",
        repro: "findings/finding_feature_export_csv_001/repro.spec.ts"
      },
      dedupeFingerprint: "feature:run_feature_1:check_1"
    });

    expect(parsed.persona).toBe("feature");
  });
});
```

- [ ] **Step 2: Add failing run-store artifact test**

Append to `tests/runStore.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunStore, writeJsonArtifact } from "../src/runs/runStore.js";

describe("writeJsonArtifact", () => {
  it("writes arbitrary run JSON under the run directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "possum-run-artifact-"));
    const store = createRunStore(root);

    const path = await writeJsonArtifact(store, "run_1", "verification.json", {
      runType: "feature_verification",
      checks: [{ id: "check_1", verdict: "passed" }]
    });

    expect(path).toBe(join(root, ".possum", "runs", "run_1", "verification.json"));
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
      runType: "feature_verification",
      checks: [{ id: "check_1", verdict: "passed" }]
    });
  });
});
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
rtk proxy npm test -- tests/contracts.test.ts tests/runStore.test.ts
```

Expected: FAIL because `feature`, `runType`, and `writeJsonArtifact` do not exist.

- [ ] **Step 4: Implement contracts**

In `src/contracts/config.ts`, change the persona enum to include `feature`:

```ts
export const PersonaSchema = z.enum(["beginner", "impatient", "hostile", "returning", "claims", "feature"]);
```

In `src/contracts/findings.ts`, add `RunTypeSchema` and `runType`:

```ts
export const RunTypeSchema = z.enum(["audit", "app_verification", "feature_verification"]);

export const RunReportSchema = z.object({
  runType: RunTypeSchema.default("audit"),
  runId: z.string().min(1),
  targetUrl: z.string().url(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  personas: z.array(PersonaSchema),
  findings: z.array(FindingSchema)
});

export type RunType = z.infer<typeof RunTypeSchema>;
```

Keep existing exports for `Severity`, `Confidence`, `Finding`, and `RunReport`.

- [ ] **Step 5: Render run type in Markdown**

In `src/report/renderMarkdown.ts`, add:

```ts
function formatRunTitle(report: RunReport): string {
  switch (report.runType) {
    case "feature_verification":
      return `# Possum Feature Verification ${report.runId}`;
    case "app_verification":
      return `# Possum App Verification ${report.runId}`;
    case "audit":
      return `# Possum Audit ${report.runId}`;
  }
}
```

Then replace the first line in `renderRunMarkdown` with:

```ts
formatRunTitle(report),
```

- [ ] **Step 6: Add generic JSON artifact writer**

In `src/runs/runStore.ts`, add this function:

```ts
export async function writeJsonArtifact(
  store: RunStore,
  runId: string,
  relativePath: string,
  data: unknown
): Promise<string> {
  const artifactPath = join(store.runsDir, runId, relativePath);
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return artifactPath;
}
```

Update the import line to include `dirname`:

```ts
import { dirname, join } from "node:path";
```

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```bash
rtk proxy npm test -- tests/contracts.test.ts tests/runStore.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk proxy git add src/contracts/config.ts src/contracts/findings.ts src/report/renderMarkdown.ts src/runs/runStore.ts tests/contracts.test.ts tests/runStore.test.ts
rtk proxy git commit -m "feat: add verification run contracts"
```

---

### Task 2: Feature Verification Types and Check Normalization

**Files:**
- Create: `src/verification/types.ts`
- Create: `tests/verificationTypes.test.ts`

**Interfaces:**
- Produces: `FeatureVerificationBriefSchema`, `normalizeFeatureChecks(brief, inferredChecks?)`, `FeatureVerificationSummary`.
- Consumes: none from new feature-verification code.

- [ ] **Step 1: Write failing tests for brief parsing and normalization**

Create `tests/verificationTypes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/verificationTypes.test.ts
```

Expected: FAIL because `src/verification/types.ts` does not exist.

- [ ] **Step 3: Implement verification types**

Create `src/verification/types.ts`:

```ts
import { z } from "zod";

export const VerificationVerdictSchema = z.enum(["passed", "failed", "inconclusive"]);
export const VerificationCheckSourceSchema = z.enum(["explicit", "inferred"]);
export const FeatureSetupStatusSchema = z.enum(["skipped", "passed", "inconclusive"]);

export const FeatureCheckBriefSchema = z.object({
  text: z.string().trim().min(1),
  hints: z.record(z.unknown()).optional()
});

export const FeatureVerificationBriefSchema = z.object({
  feature: z.string().trim().min(1),
  pages: z.array(z.string().trim().min(1)).default([]),
  setup: z.array(z.string().trim().min(1)).default([]),
  checks: z.array(FeatureCheckBriefSchema).default([])
});

export const VerificationCheckSchema = z.object({
  id: z.string().min(1),
  source: VerificationCheckSourceSchema,
  text: z.string().min(1),
  pages: z.array(z.string().min(1)),
  hints: z.record(z.unknown()).optional()
});

export const VerificationActionRecordSchema = z.object({
  action: z.string().min(1),
  detail: z.string().min(1),
  url: z.string().optional(),
  evidence: z.record(z.unknown()).optional()
});

export const FeatureSetupResultSchema = z.object({
  status: FeatureSetupStatusSchema,
  reason: z.string().optional(),
  actions: z.array(VerificationActionRecordSchema)
});

export const FeatureCheckResultSchema = z.object({
  id: z.string().min(1),
  source: VerificationCheckSourceSchema,
  text: z.string().min(1),
  verdict: VerificationVerdictSchema,
  reason: z.string().min(1),
  actions: z.array(VerificationActionRecordSchema)
});

export const FeatureVerificationSummarySchema = z.object({
  runType: z.literal("feature_verification"),
  feature: z.string().min(1),
  targetUrl: z.string().url(),
  setup: FeatureSetupResultSchema,
  checks: z.array(FeatureCheckResultSchema)
});

export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;
export type VerificationCheckSource = z.infer<typeof VerificationCheckSourceSchema>;
export type FeatureSetupStatus = z.infer<typeof FeatureSetupStatusSchema>;
export type FeatureCheckBrief = z.infer<typeof FeatureCheckBriefSchema>;
export type FeatureVerificationBrief = z.infer<typeof FeatureVerificationBriefSchema>;
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;
export type VerificationActionRecord = z.infer<typeof VerificationActionRecordSchema>;
export type FeatureSetupResult = z.infer<typeof FeatureSetupResultSchema>;
export type FeatureCheckResult = z.infer<typeof FeatureCheckResultSchema>;
export type FeatureVerificationSummary = z.infer<typeof FeatureVerificationSummarySchema>;

const MAX_INFERRED_CHECKS = 3;

export function normalizeFeatureChecks(
  brief: FeatureVerificationBrief,
  inferredChecks: FeatureCheckBrief[] = []
): VerificationCheck[] {
  const explicit = brief.checks.map((check, index): VerificationCheck => ({
    id: `check_${index + 1}`,
    source: "explicit",
    text: check.text,
    pages: brief.pages,
    hints: check.hints
  }));

  const inferred = inferredChecks.slice(0, MAX_INFERRED_CHECKS).map((check, index): VerificationCheck => ({
    id: `check_${explicit.length + index + 1}`,
    source: "inferred",
    text: check.text,
    pages: brief.pages,
    hints: check.hints
  }));

  return [...explicit, ...inferred];
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk proxy npm test -- tests/verificationTypes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/verification/types.ts tests/verificationTypes.test.ts
rtk proxy git commit -m "feat: add feature verification types"
```

---

### Task 3: LLM Check Inference

**Files:**
- Create: `src/verification/checkInference.ts`
- Create: `tests/checkInference.test.ts`

**Interfaces:**
- Consumes: `FeatureVerificationBrief`, `FeatureCheckBrief` from `src/verification/types.ts`; `LlmClient`.
- Produces: `inferFeatureChecks(input): Promise<FeatureCheckBrief[]>`, `FeatureCheckInferenceError`.

- [ ] **Step 1: Write failing tests for check inference**

Create `tests/checkInference.test.ts`:

```ts
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
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/checkInference.test.ts
```

Expected: FAIL because `src/verification/checkInference.ts` does not exist.

- [ ] **Step 3: Implement check inference**

Create `src/verification/checkInference.ts`:

```ts
import { z } from "zod";
import { LlmClient } from "../llm/client.js";
import { FeatureCheckBrief, FeatureCheckBriefSchema, FeatureVerificationBrief } from "./types.js";

export class FeatureCheckInferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureCheckInferenceError";
  }
}

export interface InferFeatureChecksInput {
  brief: FeatureVerificationBrief;
  llm: LlmClient;
  model: string;
  maxChecks?: number;
}

const InferredChecksSchema = z.array(FeatureCheckBriefSchema).min(1);

const SYSTEM_PROMPT = [
  "You are Possum, a browser-based app verifier for coding agents.",
  "Infer a small set of customer-visible checks for a completed feature.",
  "Return ONLY a JSON array of objects shaped as {\"text\": string, \"hints\"?: object}.",
  "Do not include code assertions, database checks, API checks, or source-code checks.",
  "Prefer checks a user can verify in the browser."
].join("\n");

export async function inferFeatureChecks(input: InferFeatureChecksInput): Promise<FeatureCheckBrief[]> {
  const response = await input.llm.complete({
    model: input.model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input.brief)
  });

  try {
    const parsed = InferredChecksSchema.parse(JSON.parse(response.text));
    return parsed.slice(0, input.maxChecks ?? 3);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FeatureCheckInferenceError(`Could not infer feature checks: ${message}`);
  }
}

function buildPrompt(brief: FeatureVerificationBrief): string {
  return [
    `Feature: ${brief.feature}`,
    `Pages: ${brief.pages.length > 0 ? brief.pages.join(", ") : "none provided"}`,
    `Setup: ${brief.setup.length > 0 ? brief.setup.join("; ") : "none provided"}`,
    "Infer up to 3 browser-visible acceptance checks."
  ].join("\n");
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk proxy npm test -- tests/checkInference.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/verification/checkInference.ts tests/checkInference.test.ts
rtk proxy git commit -m "feat: infer feature verification checks"
```

---

### Task 4: LLM Browser Verifier Core

**Files:**
- Create: `src/verification/browserVerifier.ts`
- Create: `tests/browserVerifier.test.ts`

**Interfaces:**
- Consumes: `VerificationCheck`, `FeatureCheckResult`, `VerificationActionRecord`, `LlmClient`.
- Produces: `VerificationBrowserPage`, `verifyFeatureCheck(input)`, `verifyFeatureSetup(input)`.

- [ ] **Step 1: Write failing browser verifier tests**

Create `tests/browserVerifier.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";
import { VerificationBrowserPage, verifyFeatureCheck, verifyFeatureSetup } from "../src/verification/browserVerifier.js";
import { VerificationCheck } from "../src/verification/types.js";

class FakeVerificationPage implements VerificationBrowserPage {
  public readonly clicked: string[] = [];
  public readonly filled: Array<{ target: string; value: string }> = [];
  public readonly pressed: string[] = [];
  public readonly visited: string[] = [];

  constructor(private readonly bodyText = "Reports page with Export CSV button") {}

  async goto(pathOrUrl: string): Promise<void> {
    this.visited.push(pathOrUrl);
  }

  async observe() {
    return {
      url: "http://app.test/reports",
      title: "Reports",
      bodyText: this.bodyText,
      links: [],
      buttons: ["Export CSV"],
      inputs: []
    };
  }

  async clickText(text: string, options?: { expectDownload?: boolean }) {
    this.clicked.push(text);
    return options?.expectDownload
      ? { downloadSuggestedFilename: "reports.csv" }
      : undefined;
  }

  async fillField(target: string, value: string): Promise<void> {
    this.filled.push({ target, value });
  }

  async press(key: string): Promise<void> {
    this.pressed.push(key);
  }
}

const check: VerificationCheck = {
  id: "check_1",
  source: "explicit",
  text: "Click Export CSV and confirm a CSV downloads",
  pages: ["/reports"],
  hints: { clickText: "Export CSV", expectedDownload: ".csv" }
};

describe("verifyFeatureCheck", () => {
  it("returns passed when the verifier concludes passed", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "CSV download was observed." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("passed");
    expect(result.reason).toBe("CSV download was observed.");
    expect(result.actions.map((action) => action.action)).toEqual(["observe", "conclude"]);
  });

  it("executes click actions and records download evidence", async () => {
    const page = new FakeVerificationPage();
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Export CSV", expectDownload: true }),
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "Download filename reports.csv was observed." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page,
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(page.clicked).toEqual(["Export CSV"]);
    expect(result.actions).toContainEqual({
      action: "click",
      detail: "Export CSV",
      evidence: { downloadSuggestedFilename: "reports.csv" }
    });
  });

  it("returns failed when the verifier concludes failed", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Export CSV button is missing." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage("Reports page without export"),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("failed");
    expect(result.reason).toContain("missing");
  });

  it("returns inconclusive on provider errors", async () => {
    const llm = {
      async complete() {
        throw new Error("provider timed out");
      }
    };

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.verdict).toBe("inconclusive");
    expect(result.reason).toContain("provider timed out");
  });

  it("blocks cross-origin navigation", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "goto", path: "https://evil.test/phish" }),
      JSON.stringify({ action: "conclude", verdict: "inconclusive", reason: "Could not verify without leaving the app." })
    ]);

    const result = await verifyFeatureCheck({
      check,
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.actions).toContainEqual({
      action: "blocked-navigation",
      detail: "https://evil.test/phish"
    });
  });
});

describe("verifyFeatureSetup", () => {
  it("returns skipped when no setup instructions are provided", async () => {
    const result = await verifyFeatureSetup({
      setup: [],
      feature: "Added CSV export",
      page: new FakeVerificationPage(),
      llm: new ScriptedLlmClient([]),
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result).toEqual({ status: "skipped", actions: [] });
  });

  it("maps failed setup conclusion to inconclusive", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Could not log in." })
    ]);

    const result = await verifyFeatureSetup({
      setup: ["Log in as demo user"],
      feature: "Added CSV export",
      page: new FakeVerificationPage(),
      llm,
      model: "agent-model",
      targetUrl: "http://app.test",
      maxSteps: 5,
      deadline: Date.now() + 60_000
    });

    expect(result.status).toBe("inconclusive");
    expect(result.reason).toBe("Could not log in.");
  });
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/browserVerifier.test.ts
```

Expected: FAIL because `src/verification/browserVerifier.ts` does not exist.

- [ ] **Step 3: Implement browser verifier action loop**

Create `src/verification/browserVerifier.ts` with these exports:

```ts
import { z } from "zod";
import { LlmClient } from "../llm/client.js";
import {
  FeatureCheckResult,
  FeatureSetupResult,
  VerificationActionRecord,
  VerificationCheck,
  VerificationVerdict
} from "./types.js";

export interface VerificationObservation {
  url: string;
  title: string;
  bodyText: string;
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  inputs: Array<{ label?: string; placeholder?: string; name?: string; value?: string }>;
}

export interface VerificationBrowserPage {
  goto(pathOrUrl: string): Promise<void>;
  observe(): Promise<VerificationObservation>;
  clickText(text: string, options?: { expectDownload?: boolean }): Promise<Record<string, unknown> | undefined>;
  fillField(target: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
}

export interface VerifyFeatureCheckInput {
  check: VerificationCheck;
  page: VerificationBrowserPage;
  llm: LlmClient;
  model: string;
  targetUrl: string;
  maxSteps: number;
  deadline: number;
  now?: () => number;
  onStep?: (step: number) => void;
}

export interface VerifyFeatureSetupInput {
  setup: string[];
  feature: string;
  page: VerificationBrowserPage;
  llm: LlmClient;
  model: string;
  targetUrl: string;
  maxSteps: number;
  deadline: number;
  now?: () => number;
}

const ActionSchema = z.union([
  z.object({ action: z.literal("goto"), path: z.string().min(1) }),
  z.object({ action: z.literal("click"), text: z.string().min(1), expectDownload: z.boolean().optional() }),
  z.object({ action: z.literal("fill"), target: z.string().min(1), value: z.string() }),
  z.object({ action: z.literal("press"), key: z.string().min(1) }),
  z.object({ action: z.literal("wait") }),
  z.object({ action: z.literal("observe") }),
  z.object({ action: z.literal("conclude"), verdict: z.enum(["passed", "failed", "inconclusive"]), reason: z.string().min(1) })
]);

type VerifierAction = z.infer<typeof ActionSchema>;

const SYSTEM_PROMPT = [
  "You are Possum, a browser-based verifier for coding agents.",
  "Use the browser observation and choose one JSON action.",
  "Allowed actions: goto, click, fill, press, wait, observe, conclude.",
  "Conclude with verdict passed, failed, or inconclusive.",
  "Never navigate outside the same app origin."
].join("\n");

export async function verifyFeatureCheck(input: VerifyFeatureCheckInput): Promise<FeatureCheckResult> {
  const actions: VerificationActionRecord[] = [];
  const now = input.now ?? Date.now;

  for (let step = 1; step <= input.maxSteps; step += 1) {
    if (now() >= input.deadline) {
      return finish(input.check, actions, "inconclusive", "wall-clock budget reached");
    }

    input.onStep?.(step);

    try {
      const observation = await input.page.observe();
      actions.push({ action: "observe", detail: observation.title, url: observation.url });

      const response = await input.llm.complete({
        model: input.model,
        system: SYSTEM_PROMPT,
        prompt: buildCheckPrompt(input.check, observation)
      });
      const action = parseAction(response.text);
      if (!action) {
        actions.push({ action: "invalid-action", detail: response.text });
        continue;
      }

      const concluded = await executeAction({ action, page: input.page, targetUrl: input.targetUrl, actions });
      if (concluded) {
        return finish(input.check, actions, concluded.verdict, concluded.reason);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return finish(input.check, actions, "inconclusive", reason);
    }
  }

  return finish(input.check, actions, "inconclusive", `Step budget exhausted after ${input.maxSteps} steps.`);
}

export async function verifyFeatureSetup(input: VerifyFeatureSetupInput): Promise<FeatureSetupResult> {
  if (input.setup.length === 0) {
    return { status: "skipped", actions: [] };
  }

  const setupCheck: VerificationCheck = {
    id: "setup",
    source: "explicit",
    text: `Complete setup for feature: ${input.feature}. Steps: ${input.setup.join("; ")}`,
    pages: [],
    hints: undefined
  };

  const result = await verifyFeatureCheck({
    check: setupCheck,
    page: input.page,
    llm: input.llm,
    model: input.model,
    targetUrl: input.targetUrl,
    maxSteps: input.maxSteps,
    deadline: input.deadline,
    now: input.now
  });

  if (result.verdict === "passed") {
    return { status: "passed", reason: result.reason, actions: result.actions };
  }

  return { status: "inconclusive", reason: result.reason, actions: result.actions };
}

async function executeAction(input: {
  action: VerifierAction;
  page: VerificationBrowserPage;
  targetUrl: string;
  actions: VerificationActionRecord[];
}): Promise<{ verdict: VerificationVerdict; reason: string } | undefined> {
  switch (input.action.action) {
    case "goto": {
      if (!isSameOriginNavigation(input.targetUrl, input.action.path)) {
        input.actions.push({ action: "blocked-navigation", detail: input.action.path });
        return undefined;
      }
      await input.page.goto(input.action.path);
      input.actions.push({ action: "goto", detail: input.action.path });
      return undefined;
    }
    case "click": {
      const evidence = await input.page.clickText(input.action.text, { expectDownload: input.action.expectDownload });
      input.actions.push({ action: "click", detail: input.action.text, evidence });
      return undefined;
    }
    case "fill":
      await input.page.fillField(input.action.target, input.action.value);
      input.actions.push({ action: "fill", detail: input.action.target, evidence: { value: input.action.value } });
      return undefined;
    case "press":
      await input.page.press(input.action.key);
      input.actions.push({ action: "press", detail: input.action.key });
      return undefined;
    case "wait":
      await new Promise((resolve) => setTimeout(resolve, 250));
      input.actions.push({ action: "wait", detail: "250ms" });
      return undefined;
    case "observe":
      input.actions.push({ action: "observe-requested", detail: "LLM requested another observation" });
      return undefined;
    case "conclude":
      input.actions.push({ action: "conclude", detail: input.action.reason, evidence: { verdict: input.action.verdict } });
      return { verdict: input.action.verdict, reason: input.action.reason };
  }
}

function parseAction(text: string): VerifierAction | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return undefined;
  }

  try {
    return ActionSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}

function buildCheckPrompt(check: VerificationCheck, observation: VerificationObservation): string {
  return JSON.stringify(
    {
      check: { text: check.text, source: check.source, pages: check.pages, hints: check.hints },
      observation
    },
    null,
    2
  );
}

function finish(
  check: VerificationCheck,
  actions: VerificationActionRecord[],
  verdict: VerificationVerdict,
  reason: string
): FeatureCheckResult {
  return { id: check.id, source: check.source, text: check.text, verdict, reason, actions };
}

function isSameOriginNavigation(targetUrl: string, pathOrUrl: string): boolean {
  const base = new URL(targetUrl);
  const destination = new URL(pathOrUrl, base);
  return destination.origin === base.origin;
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk proxy npm test -- tests/browserVerifier.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/verification/browserVerifier.ts tests/browserVerifier.test.ts
rtk proxy git commit -m "feat: add llm browser verifier core"
```

---

### Task 5: Playwright Verification Page Adapter

**Files:**
- Create: `src/verification/playwrightVerificationPage.ts`
- Create: `tests/playwrightVerificationPage.test.ts`

**Interfaces:**
- Consumes: `VerificationBrowserPage`, `VerificationObservation` from `browserVerifier.ts`.
- Produces: `createPlaywrightVerificationPage(page): VerificationBrowserPage`.

- [ ] **Step 1: Write failing Playwright adapter tests**

Create `tests/playwrightVerificationPage.test.ts`:

```ts
import { test, expect } from "@playwright/test";
import { createPlaywrightVerificationPage } from "../src/verification/playwrightVerificationPage.js";

test("observes visible page controls", async ({ page }) => {
  await page.setContent(`
    <html>
      <head><title>Reports</title></head>
      <body>
        <h1>Reports</h1>
        <a href="/settings">Settings</a>
        <button>Export CSV</button>
        <label>Email <input name="email" placeholder="you@example.com" /></label>
      </body>
    </html>
  `);

  const verifierPage = createPlaywrightVerificationPage(page);
  const observation = await verifierPage.observe();

  expect(observation.title).toBe("Reports");
  expect(observation.bodyText).toContain("Reports");
  expect(observation.links).toContainEqual({ text: "Settings", href: "/settings" });
  expect(observation.buttons).toContain("Export CSV");
  expect(observation.inputs).toContainEqual({ label: "Email", placeholder: "you@example.com", name: "email", value: "" });
});

test("clickText clicks visible controls", async ({ page }) => {
  await page.setContent(`<button onclick="window.clicked = true">Export CSV</button>`);

  const verifierPage = createPlaywrightVerificationPage(page);
  await verifierPage.clickText("Export CSV");

  expect(await page.evaluate(() => (window as unknown as { clicked?: boolean }).clicked)).toBe(true);
});

test("fillField fills by label", async ({ page }) => {
  await page.setContent(`<label>Email <input name="email" /></label>`);

  const verifierPage = createPlaywrightVerificationPage(page);
  await verifierPage.fillField("Email", "demo@example.com");

  expect(await page.locator('input[name="email"]').inputValue()).toBe("demo@example.com");
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/playwrightVerificationPage.test.ts
```

Expected: FAIL because `src/verification/playwrightVerificationPage.ts` does not exist.

- [ ] **Step 3: Implement Playwright adapter**

Create `src/verification/playwrightVerificationPage.ts`:

```ts
import { Page } from "playwright";
import { VerificationBrowserPage, VerificationObservation } from "./browserVerifier.js";

export function createPlaywrightVerificationPage(page: Page): VerificationBrowserPage {
  return {
    async goto(pathOrUrl: string): Promise<void> {
      await page.goto(pathOrUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
    },

    async observe(): Promise<VerificationObservation> {
      const [title, bodyText, links, buttons, inputs] = await Promise.all([
        page.title(),
        page.locator("body").innerText({ timeout: 1000 }).catch(() => ""),
        page.locator("a").evaluateAll((nodes) =>
          nodes.map((node) => ({
            text: (node.textContent ?? "").trim(),
            href: node.getAttribute("href") ?? ""
          }))
        ),
        page.locator("button, input[type='button'], input[type='submit'], [role='button']").evaluateAll((nodes) =>
          nodes
            .map((node) =>
              (node.textContent ?? node.getAttribute("value") ?? node.getAttribute("aria-label") ?? "").trim()
            )
            .filter(Boolean)
        ),
        page.locator("input, textarea, select").evaluateAll((nodes) =>
          nodes.map((node) => {
            const id = node.getAttribute("id");
            const label = id
              ? (document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent ?? "").trim()
              : (node.closest("label")?.textContent ?? "").trim();
            return {
              label: label || undefined,
              placeholder: node.getAttribute("placeholder") ?? undefined,
              name: node.getAttribute("name") ?? undefined,
              value: (node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? ""
            };
          })
        )
      ]);

      return {
        url: page.url(),
        title,
        bodyText,
        links: links.filter((link) => link.text.length > 0 || link.href.length > 0),
        buttons,
        inputs
      };
    },

    async clickText(text: string, options?: { expectDownload?: boolean }): Promise<Record<string, unknown> | undefined> {
      const locator = page.getByText(text, { exact: true }).first();
      if (options?.expectDownload) {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 5000 }),
          locator.click({ timeout: 5000 })
        ]);
        return { downloadSuggestedFilename: download.suggestedFilename() };
      }
      await locator.click({ timeout: 5000 });
      return undefined;
    },

    async fillField(target: string, value: string): Promise<void> {
      await page.getByLabel(target).or(page.getByPlaceholder(target)).first().fill(value, { timeout: 5000 });
    },

    async press(key: string): Promise<void> {
      await page.keyboard.press(key);
    }
  };
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk proxy npm test -- tests/playwrightVerificationPage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/verification/playwrightVerificationPage.ts tests/playwrightVerificationPage.test.ts
rtk proxy git commit -m "feat: adapt playwright pages for verification"
```

---

### Task 6: Failed Check Findings

**Files:**
- Create: `src/verification/featureFindings.ts`
- Create: `tests/featureFindings.test.ts`

**Interfaces:**
- Consumes: `FeatureCheckResult`, `Finding`.
- Produces: `createFeatureFinding(input): Finding`, `createFeatureFindingTrace(result)`, `createFeatureFindingRepro(targetUrl, result)`.

- [ ] **Step 1: Write failing findings tests**

Create `tests/featureFindings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createFeatureFinding, createFeatureFindingRepro, createFeatureFindingTrace } from "../src/verification/featureFindings.js";
import { FeatureCheckResult } from "../src/verification/types.js";

const failedResult: FeatureCheckResult = {
  id: "check_1",
  source: "explicit",
  text: "Click Export CSV and confirm a CSV downloads",
  verdict: "failed",
  reason: "No download started after clicking Export CSV.",
  actions: [
    { action: "observe", detail: "Reports", url: "http://app.test/reports" },
    { action: "click", detail: "Export CSV" },
    { action: "conclude", detail: "No download started after clicking Export CSV.", evidence: { verdict: "failed" } }
  ]
};

describe("createFeatureFinding", () => {
  it("maps failed explicit checks to high severity feature findings", () => {
    const finding = createFeatureFinding({
      runId: "run_1",
      targetUrl: "http://app.test",
      index: 0,
      result: failedResult
    });

    expect(finding).toMatchObject({
      id: "finding_feature_check_001",
      runId: "run_1",
      persona: "feature",
      severity: "high",
      confidence: "confirmed",
      claim: "Click Export CSV and confirm a CSV downloads",
      expected: "Feature check should pass: Click Export CSV and confirm a CSV downloads",
      actual: "No download started after clicking Export CSV.",
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_feature_check_001/trace.json",
        repro: "findings/finding_feature_check_001/repro.spec.ts"
      },
      dedupeFingerprint: "feature:run_1:check_1"
    });
  });

  it("maps failed inferred checks to medium severity", () => {
    const finding = createFeatureFinding({
      runId: "run_1",
      targetUrl: "http://app.test",
      index: 1,
      result: { ...failedResult, id: "check_2", source: "inferred" }
    });

    expect(finding.id).toBe("finding_feature_check_002");
    expect(finding.severity).toBe("medium");
  });
});

describe("feature finding artifacts", () => {
  it("creates trace from check actions", () => {
    expect(createFeatureFindingTrace(failedResult)).toEqual({
      checkId: "check_1",
      source: "explicit",
      verdict: "failed",
      actions: failedResult.actions
    });
  });

  it("creates a basic repro spec", () => {
    expect(createFeatureFindingRepro("http://app.test", failedResult)).toContain(
      'await page.goto("http://app.test", { waitUntil: "domcontentloaded", timeout: 5000 });'
    );
    expect(createFeatureFindingRepro("http://app.test", failedResult)).toContain("Export CSV");
  });
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/featureFindings.test.ts
```

Expected: FAIL because `src/verification/featureFindings.ts` does not exist.

- [ ] **Step 3: Implement feature finding helpers**

Create `src/verification/featureFindings.ts`:

```ts
import { Finding } from "../contracts/findings.js";
import { FeatureCheckResult } from "./types.js";

export interface CreateFeatureFindingInput {
  runId: string;
  targetUrl: string;
  index: number;
  result: FeatureCheckResult;
}

export function createFeatureFinding(input: CreateFeatureFindingInput): Finding {
  const id = `finding_feature_check_${String(input.index + 1).padStart(3, "0")}`;

  return {
    id,
    runId: input.runId,
    persona: "feature",
    severity: input.result.source === "explicit" ? "high" : "medium",
    confidence: "confirmed",
    mission: "Verify completed feature behavior in the browser.",
    claim: input.result.text,
    expected: `Feature check should pass: ${input.result.text}`,
    actual: input.result.reason,
    reproducibility: { status: "reproduced", attempts: 1 },
    evidence: {
      screenshots: [],
      trace: `findings/${id}/trace.json`,
      repro: `findings/${id}/repro.spec.ts`
    },
    dedupeFingerprint: `feature:${input.runId}:${input.result.id}`
  };
}

export function createFeatureFindingTrace(result: FeatureCheckResult): unknown {
  return {
    checkId: result.id,
    source: result.source,
    verdict: result.verdict,
    actions: result.actions
  };
}

export function createFeatureFindingRepro(targetUrl: string, result: FeatureCheckResult): string {
  const clickActions = result.actions.filter((action) => action.action === "click").map((action) => action.detail);
  const lines = [
    'import { test } from "@playwright/test";',
    "",
    `test(${JSON.stringify(result.text)}, async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(targetUrl)}, { waitUntil: "domcontentloaded", timeout: 5000 });`
  ];

  for (const text of clickActions) {
    lines.push(`  await page.getByText(${JSON.stringify(text)}, { exact: true }).first().click();`);
  }

  lines.push("});", "");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk proxy npm test -- tests/featureFindings.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/verification/featureFindings.ts tests/featureFindings.test.ts
rtk proxy git commit -m "feat: create findings for failed feature checks"
```

---

### Task 7: Feature Verification Orchestration

**Files:**
- Create: `src/verification/featureVerification.ts`
- Create: `tests/featureVerification.test.ts`

**Interfaces:**
- Consumes: `FeatureVerificationBrief`, `inferFeatureChecks`, `normalizeFeatureChecks`, `verifyFeatureSetup`, `verifyFeatureCheck`, `createFeatureFinding`, `writeRunReport`, `writeJsonArtifact`, `writeFindingArtifacts`.
- Produces: `runFeatureVerification(input): Promise<FeatureVerificationResult>`.

- [ ] **Step 1: Write failing orchestration tests**

Create `tests/featureVerification.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";
import { VerificationBrowserPage } from "../src/verification/browserVerifier.js";
import { runFeatureVerification } from "../src/verification/featureVerification.js";

class FakePage implements VerificationBrowserPage {
  async goto(): Promise<void> {}
  async observe() {
    return {
      url: "http://app.test/reports",
      title: "Reports",
      bodyText: "Reports with Export CSV",
      links: [],
      buttons: ["Export CSV"],
      inputs: []
    };
  }
  async clickText() {
    return undefined;
  }
  async fillField(): Promise<void> {}
  async press(): Promise<void> {}
}

describe("runFeatureVerification", () => {
  it("writes verification summary for a passed explicit check", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-pass-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "Export button is visible." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: [],
        checks: [{ text: "Export CSV button is visible" }]
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const summary = JSON.parse(await readFile(result.verificationJsonPath, "utf8"));
    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));

    expect(summary.checks).toHaveLength(1);
    expect(summary.checks[0]).toMatchObject({ source: "explicit", verdict: "passed" });
    expect(report.runType).toBe("feature_verification");
    expect(report.findings).toEqual([]);
  });

  it("creates a finding artifact for a failed check", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-fail-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Export CSV button is missing." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: [],
        checks: [{ text: "Export CSV button is visible" }]
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const trace = JSON.parse(await readFile(join(result.runDir, "findings", "finding_feature_check_001", "trace.json"), "utf8"));

    expect(report.findings[0]).toMatchObject({ id: "finding_feature_check_001", persona: "feature" });
    expect(trace.verdict).toBe("failed");
  });

  it("marks checks inconclusive when setup fails", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-setup-fail-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "failed", reason: "Could not log in." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: ["Log in as demo user"],
        checks: [{ text: "Export CSV button is visible" }]
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const summary = JSON.parse(await readFile(result.verificationJsonPath, "utf8"));
    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));

    expect(summary.setup.status).toBe("inconclusive");
    expect(summary.checks[0]).toMatchObject({ verdict: "inconclusive", reason: "setup inconclusive: Could not log in." });
    expect(report.findings).toEqual([]);
  });

  it("infers checks when no explicit checks are supplied", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-feature-infer-"));
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ text: "Export CSV button is visible", hints: { page: "/reports" } }]),
      JSON.stringify({ action: "conclude", verdict: "passed", reason: "Export button is visible." })
    ]);

    const result = await runFeatureVerification({
      rootDir,
      targetUrl: "http://app.test",
      brief: {
        feature: "Added CSV export",
        pages: ["/reports"],
        setup: [],
        checks: []
      },
      llm,
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000,
      now: new Date("2026-06-28T01:00:00.000Z"),
      pageFactory: async () => new FakePage()
    });

    const summary = JSON.parse(await readFile(result.verificationJsonPath, "utf8"));
    expect(summary.checks[0]).toMatchObject({ source: "inferred", text: "Export CSV button is visible" });
  });
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/featureVerification.test.ts
```

Expected: FAIL because `src/verification/featureVerification.ts` does not exist.

- [ ] **Step 3: Implement feature verification orchestration**

Create `src/verification/featureVerification.ts`:

```ts
import { Browser, chromium } from "playwright";
import { LlmClient } from "../llm/client.js";
import { createRunStore, writeFindingArtifacts, writeJsonArtifact, writeRunReport } from "../runs/runStore.js";
import { formatRunId } from "../audit/auditStub.js";
import { ManagedRunCommand, startRunCommand } from "../audit/runCommand.js";
import { inferFeatureChecks } from "./checkInference.js";
import { createFeatureFinding, createFeatureFindingRepro, createFeatureFindingTrace } from "./featureFindings.js";
import { createPlaywrightVerificationPage } from "./playwrightVerificationPage.js";
import { VerificationBrowserPage, verifyFeatureCheck, verifyFeatureSetup } from "./browserVerifier.js";
import {
  FeatureCheckResult,
  FeatureVerificationBrief,
  FeatureVerificationBriefSchema,
  FeatureVerificationSummary,
  normalizeFeatureChecks
} from "./types.js";

export interface RunFeatureVerificationInput {
  rootDir: string;
  targetUrl: string;
  runCommand?: string;
  brief: FeatureVerificationBrief;
  llm: LlmClient;
  model: string;
  maxSteps: number;
  budgetMs: number;
  now?: Date;
  pageFactory?: () => Promise<VerificationBrowserPage>;
}

export interface FeatureVerificationResult {
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
  verificationJsonPath: string;
}

export async function runFeatureVerification(input: RunFeatureVerificationInput): Promise<FeatureVerificationResult> {
  const startedAt = input.now ?? new Date();
  const runId = formatRunId(startedAt);
  const store = createRunStore(input.rootDir);
  const brief = FeatureVerificationBriefSchema.parse(input.brief);
  const deadline = Date.now() + input.budgetMs;
  const browsers: Browser[] = [];
  let managedRunCommand: ManagedRunCommand | undefined;

  try {
    if (input.runCommand) {
      managedRunCommand = startRunCommand(input.runCommand, { cwd: input.rootDir });
      await managedRunCommand.ready;
    }

    const inferred = brief.checks.length === 0 ? await inferFeatureChecks({ brief, llm: input.llm, model: input.model }) : [];
    const checks = normalizeFeatureChecks(brief, inferred);
    const page = input.pageFactory
      ? await input.pageFactory()
      : await createDefaultPage(input.targetUrl, browsers);

    const setup = await verifyFeatureSetup({
      setup: brief.setup,
      feature: brief.feature,
      page,
      llm: input.llm,
      model: input.model,
      targetUrl: input.targetUrl,
      maxSteps: input.maxSteps,
      deadline
    });

    const checkResults: FeatureCheckResult[] = [];
    if (setup.status === "inconclusive") {
      for (const check of checks) {
        checkResults.push({
          id: check.id,
          source: check.source,
          text: check.text,
          verdict: "inconclusive",
          reason: `setup inconclusive: ${setup.reason ?? "setup did not complete"}`,
          actions: []
        });
      }
    } else {
      for (const check of checks) {
        checkResults.push(
          await verifyFeatureCheck({
            check,
            page,
            llm: input.llm,
            model: input.model,
            targetUrl: input.targetUrl,
            maxSteps: input.maxSteps,
            deadline
          })
        );
      }
    }

    const summary: FeatureVerificationSummary = {
      runType: "feature_verification",
      feature: brief.feature,
      targetUrl: input.targetUrl,
      setup,
      checks: checkResults
    };

    const failed = checkResults.filter((result) => result.verdict === "failed");
    const findings = failed.map((result, index) =>
      createFeatureFinding({ runId, targetUrl: input.targetUrl, index, result })
    );

    const completedAt = new Date();
    const written = await writeRunReport(store, {
      runType: "feature_verification",
      runId,
      targetUrl: input.targetUrl,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      personas: ["feature"],
      findings
    });

    const verificationJsonPath = await writeJsonArtifact(store, runId, "verification.json", summary);

    await Promise.all(
      findings.map((finding, index) => {
        const result = failed[index];
        return writeFindingArtifacts(store, runId, finding, {
          trace: createFeatureFindingTrace(result),
          reproSpec: createFeatureFindingRepro(input.targetUrl, result)
        });
      })
    );

    return { ...written, runId, verificationJsonPath };
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()));
    await managedRunCommand?.stop();
  }
}

async function createDefaultPage(targetUrl: string, browsers: Browser[]): Promise<VerificationBrowserPage> {
  const browser = await chromium.launch();
  browsers.push(browser);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
  return createPlaywrightVerificationPage(page);
}
```

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk proxy npm test -- tests/featureVerification.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk proxy git add src/verification/featureVerification.ts tests/featureVerification.test.ts
rtk proxy git commit -m "feat: run feature verification"
```

---

### Task 8: Verify-App Wrapper and Audit Compatibility Alias

**Files:**
- Create: `src/verification/appVerification.ts`
- Modify: `src/audit/audit.ts`
- Create: `tests/verifyApp.test.ts`
- Modify: `tests/auditStub.test.ts` or existing audit report tests if they assert title/report fields.

**Interfaces:**
- Consumes: `runAudit(input)`.
- Produces: `verifyApp(input): Promise<AuditResult>`.

- [ ] **Step 1: Write failing verify-app test**

Create `tests/verifyApp.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyApp } from "../src/verification/appVerification.js";

describe("verifyApp", () => {
  it("wraps current audit behavior and marks run as app_verification", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "possum-verify-app-"));

    const result = await verifyApp({
      rootDir,
      targetUrl: "http://127.0.0.1:9",
      now: new Date("2026-06-28T02:00:00.000Z")
    });

    const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));
    const markdown = await readFile(result.reportMarkdownPath, "utf8");

    expect(report.runType).toBe("app_verification");
    expect(markdown).toContain("# Possum App Verification run_20260628_020000");
  });
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/verifyApp.test.ts
```

Expected: FAIL because `src/verification/appVerification.ts` does not exist and `runAudit` cannot mark app-verification reports yet.

- [ ] **Step 3: Add runType override to audit**

In `src/audit/audit.ts`, import `RunType`:

```ts
import { Finding, RunType } from "../contracts/findings.js";
```

Extend `AuditInput`:

```ts
runType?: RunType;
```

When calling `writeRunReport`, add:

```ts
runType: input.runType ?? "audit",
```

Keep all existing `runAudit` callers working by relying on the default.

- [ ] **Step 4: Implement verifyApp wrapper**

Create `src/verification/appVerification.ts`:

```ts
import { AuditInput, AuditResult, runAudit } from "../audit/audit.js";

export type VerifyAppInput = Omit<AuditInput, "runType">;

export async function verifyApp(input: VerifyAppInput): Promise<AuditResult> {
  return runAudit({ ...input, runType: "app_verification" });
}
```

- [ ] **Step 5: Run focused tests and verify they pass**

Run:

```bash
rtk proxy npm test -- tests/verifyApp.test.ts tests/auditProbe.test.ts tests/claimAudit.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk proxy git add src/audit/audit.ts src/verification/appVerification.ts tests/verifyApp.test.ts
rtk proxy git commit -m "feat: add verify-app wrapper"
```

---

### Task 9: CLI Commands for Verify Feature and Verify App

**Files:**
- Modify: `src/cli/main.ts`
- Modify: `tests/cli.test.ts`
- Modify: `tests/configCli.test.ts` if config command expectations need adjustment.

**Interfaces:**
- Consumes: `runFeatureVerification`, `verifyApp`, `FeatureVerificationBriefSchema`, `resolveClaimVerification`.
- Produces: CLI commands `verify-feature`, `verify-app`; existing `audit` remains.

- [ ] **Step 1: Add failing CLI tests**

Append to `tests/cli.test.ts`:

```ts
it("runs verify-app and prints app verification result paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-app-"));
  const output: string[] = [];
  const program = buildProgram({
    cwd: root,
    stdout: (line) => output.push(line),
    now: new Date("2026-06-28T02:00:00.000Z")
  });

  await program.parseAsync(["node", "possum", "verify-app", "--url", "http://127.0.0.1:9"]);

  expect(output.join("\n")).toContain("Possum app verification created run_20260628_020000");
  expect(output.join("\n")).toContain("Report:");
});

it("runs verify-feature from a brief file using injected dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "possum-cli-verify-feature-"));
  const briefPath = join(root, "feature.json");
  await writeFile(
    briefPath,
    JSON.stringify({ feature: "Added CSV export", checks: [{ text: "Export CSV button is visible" }] }),
    "utf8"
  );
  const output: string[] = [];
  const program = buildProgram({
    cwd: root,
    stdout: (line) => output.push(line),
    now: new Date("2026-06-28T02:00:00.000Z"),
    resolveFeatureVerification: () => ({
      llm: { async complete() { return { text: "{}" }; } },
      model: "agent-model",
      maxSteps: 5,
      budgetMs: 60_000
    }),
    verifyFeatureImpl: async () => ({
      runId: "run_20260628_020000",
      runDir: join(root, ".possum", "runs", "run_20260628_020000"),
      reportMarkdownPath: join(root, ".possum", "runs", "run_20260628_020000", "report.md"),
      findingsJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "findings.json"),
      verificationJsonPath: join(root, ".possum", "runs", "run_20260628_020000", "verification.json")
    })
  });

  await program.parseAsync(["node", "possum", "verify-feature", "--url", "http://localhost:3000", "--brief", briefPath]);

  expect(output).toEqual([
    "Possum feature verification created run_20260628_020000",
    `Report: ${join(root, ".possum", "runs", "run_20260628_020000", "report.md")}`,
    `Verification: ${join(root, ".possum", "runs", "run_20260628_020000", "verification.json")}`
  ]);
});
```

Also update imports in `tests/cli.test.ts` to include `writeFile` if it is not already imported:

```ts
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
```

- [ ] **Step 2: Run CLI tests and verify they fail**

Run:

```bash
rtk proxy npm test -- tests/cli.test.ts
```

Expected: FAIL because CLI commands and dependency injection fields do not exist.

- [ ] **Step 3: Add CLI dependency injection fields**

In `src/cli/main.ts`, import new modules:

```ts
import { verifyApp } from "../verification/appVerification.js";
import { runFeatureVerification, RunFeatureVerificationInput } from "../verification/featureVerification.js";
import { FeatureVerificationBriefSchema } from "../verification/types.js";
import { LlmClient } from "../llm/client.js";
```

Add these types above `CliDependencies`:

```ts
interface ResolvedFeatureVerificationCliConfig {
  llm: LlmClient;
  model: string;
  maxSteps: number;
  budgetMs: number;
}

type VerifyFeatureImpl = (input: RunFeatureVerificationInput) => Promise<{
  runId: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
  verificationJsonPath: string;
}>;
```

Extend `CliDependencies`:

```ts
verifyAppImpl?: typeof verifyApp;
verifyFeatureImpl?: VerifyFeatureImpl;
resolveFeatureVerification?: (target: Awaited<ReturnType<typeof resolveAuditTarget>>) => ResolvedFeatureVerificationCliConfig;
```

- [ ] **Step 4: Add shared target budget helper**

In `src/cli/main.ts`, add after `buildProgram`:

```ts
function resolveFeatureVerificationFromTarget(
  target: Awaited<ReturnType<typeof resolveAuditTarget>>
): ResolvedFeatureVerificationCliConfig {
  const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
  const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
  const resolved = resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
    requestTimeoutMs,
    budgetMs
  });

  if (!resolved) {
    throw new Error("Feature verification requires models in possum.config.json.");
  }

  return {
    llm: resolved.llm,
    model: resolved.models.personaModel,
    maxSteps: resolved.maxSteps,
    budgetMs: resolved.budgetMs
  };
}
```

- [ ] **Step 5: Add `verify-app` command**

In `buildProgram`, before `audit`, add:

```ts
  program
    .command("verify-app")
    .description("Verify app behavior using Possum's app verification workflow.")
    .option("--url <url>", "Local app URL to verify")
    .option("--command <command>", "Sandboxed command to start the local app before verifying")
    .action(async (options: { command?: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const emitProgress = deps.stderr;
      const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
      const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
      const result = await (deps.verifyAppImpl ?? verifyApp)({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        now: deps.now,
        claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
          requestTimeoutMs,
          budgetMs
        }),
        onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
      });

      deps.stdout(`Possum app verification created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      if (result.surfaceJsonPath) {
        deps.stdout(`Surface: ${result.surfaceJsonPath}`);
      }
    });
```

Keep existing `audit` command unchanged for compatibility.

- [ ] **Step 6: Add `verify-feature` command**

In `buildProgram`, before `verify-app`, add:

```ts
  program
    .command("verify-feature")
    .description("Verify a completed feature from a JSON brief.")
    .requiredOption("--brief <path>", "Path to feature verification brief JSON")
    .option("--url <url>", "Local app URL to verify")
    .option("--command <command>", "Sandboxed command to start the local app before verifying")
    .action(async (options: { brief: string; command?: string; url?: string }) => {
      const target = await resolveAuditTarget({
        rootDir: deps.cwd,
        runCommand: options.command,
        targetUrl: options.url
      });
      const rawBrief = JSON.parse(await readFile(options.brief, "utf8"));
      const brief = FeatureVerificationBriefSchema.parse(rawBrief);
      const resolved = (deps.resolveFeatureVerification ?? resolveFeatureVerificationFromTarget)(target);
      const result = await (deps.verifyFeatureImpl ?? runFeatureVerification)({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        brief,
        llm: resolved.llm,
        model: resolved.model,
        maxSteps: resolved.maxSteps,
        budgetMs: resolved.budgetMs,
        now: deps.now
      });

      deps.stdout(`Possum feature verification created ${result.runId}`);
      deps.stdout(`Report: ${result.reportMarkdownPath}`);
      deps.stdout(`Verification: ${result.verificationJsonPath}`);
    });
```

- [ ] **Step 7: Run CLI tests and verify they pass**

Run:

```bash
rtk proxy npm test -- tests/cli.test.ts tests/configCli.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk proxy git add src/cli/main.ts tests/cli.test.ts tests/configCli.test.ts
rtk proxy git commit -m "feat: add verify feature cli"
```

---

### Task 10: Feature Progress Formatting

**Files:**
- Modify: `src/verification/types.ts`
- Modify: `src/verification/featureVerification.ts`
- Modify: `src/cli/auditProgress.ts`
- Modify: `src/audit/progress.ts`
- Modify: `tests/auditProgress.test.ts`

**Interfaces:**
- Consumes: current `AuditProgressEvent` formatter path.
- Produces: feature progress event variants included in `AuditProgressEvent`.

- [ ] **Step 1: Write failing progress formatting tests**

Append to `tests/auditProgress.test.ts`:

```ts
it("formats feature setup start", () => {
  expect(formatProgressEvent({ type: "feature-setup-start", steps: 2 })).toBe(
    "possum: setup — 2 steps..."
  );
});

it("formats feature setup done", () => {
  expect(formatProgressEvent({ type: "feature-setup-done", status: "passed" })).toBe(
    "possum: setup — passed"
  );
});

it("formats feature check start", () => {
  expect(
    formatProgressEvent({
      type: "feature-check-start",
      index: 1,
      total: 2,
      check: "Click Export CSV and confirm a CSV downloads"
    })
  ).toBe('possum: check 1/2 — "Click Export CSV and confirm a CSV downloads"');
});

it("formats feature check step", () => {
  expect(formatProgressEvent({ type: "feature-check-step", index: 1, total: 2, step: 3, maxSteps: 20 })).toBe(
    "possum: check 1/2 · step 3/20..."
  );
});

it("formats feature check done", () => {
  expect(formatProgressEvent({ type: "feature-check-done", index: 1, total: 2, verdict: "failed" })).toBe(
    "possum: check 1/2 — failed"
  );
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk proxy npm test -- tests/auditProgress.test.ts
```

Expected: FAIL because feature progress events are not in `AuditProgressEvent` or formatter.

- [ ] **Step 3: Extend progress event union**

In `src/audit/progress.ts`, add these union members to `AuditProgressEvent`:

```ts
  | { type: "feature-setup-start"; steps: number }
  | { type: "feature-setup-done"; status: "skipped" | "passed" | "inconclusive" }
  | { type: "feature-check-start"; index: number; total: number; check: string }
  | { type: "feature-check-step"; index: number; total: number; step: number; maxSteps: number }
  | { type: "feature-check-done"; index: number; total: number; verdict: "passed" | "failed" | "inconclusive" }
```

- [ ] **Step 4: Implement formatter cases**

In `src/cli/auditProgress.ts`, add cases:

```ts
    case "feature-setup-start":
      return `possum: setup — ${event.steps} ${event.steps === 1 ? "step" : "steps"}...`;
    case "feature-setup-done":
      return `possum: setup — ${event.status}`;
    case "feature-check-start":
      return `possum: check ${event.index}/${event.total} — "${formatClaimLabel(event.check)}"`;
    case "feature-check-step":
      return `possum: check ${event.index}/${event.total} · step ${event.step}/${event.maxSteps}...`;
    case "feature-check-done":
      return `possum: check ${event.index}/${event.total} — ${event.verdict}`;
```

`formatClaimLabel` already truncates text and can be reused for checks.

- [ ] **Step 5: Emit progress from feature verification**

In `src/verification/featureVerification.ts`, import `AuditProgressReporter`:

```ts
import { AuditProgressReporter } from "../audit/progress.js";
```

Add to `RunFeatureVerificationInput`:

```ts
onProgress?: AuditProgressReporter;
```

Before setup:

```ts
input.onProgress?.({ type: "feature-setup-start", steps: brief.setup.length });
```

After setup:

```ts
input.onProgress?.({ type: "feature-setup-done", status: setup.status });
```

Before each check:

```ts
input.onProgress?.({ type: "feature-check-start", index: checkIndex + 1, total: checks.length, check: check.text });
```

Pass step callback into `verifyFeatureCheck`:

```ts
onStep: (step) =>
  input.onProgress?.({
    type: "feature-check-step",
    index: checkIndex + 1,
    total: checks.length,
    step,
    maxSteps: input.maxSteps
  })
```

After each check:

```ts
input.onProgress?.({
  type: "feature-check-done",
  index: checkIndex + 1,
  total: checks.length,
  verdict: result.verdict
});
```

- [ ] **Step 6: Pass CLI progress to verify-feature**

In `src/cli/main.ts`, inside `verify-feature` action, add:

```ts
const emitProgress = deps.stderr;
```

Pass into `runFeatureVerification`:

```ts
onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
```

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```bash
rtk proxy npm test -- tests/auditProgress.test.ts tests/featureVerification.test.ts tests/cli.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk proxy git add src/audit/progress.ts src/cli/auditProgress.ts src/cli/main.ts src/verification/featureVerification.ts tests/auditProgress.test.ts tests/featureVerification.test.ts tests/cli.test.ts
rtk proxy git commit -m "feat: report feature verification progress"
```

---

### Task 11: MCP Tools for Verify Feature and Verify App

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `tests/mcp.test.ts`
- Modify: `tests/mcpHandlers.test.ts`

**Interfaces:**
- Consumes: `runFeatureVerification`, `verifyApp`, `FeatureVerificationBriefSchema`.
- Produces: MCP tools `verify_feature`, `verify_app`.

- [ ] **Step 1: Add failing MCP tool-name test**

In `tests/mcp.test.ts`, update the expected tool names to include new tools:

```ts
expect(getPossumMcpToolNames()).toEqual([
  "run_audit",
  "verify_app",
  "verify_feature",
  "list_findings",
  "get_finding",
  "replay_finding",
  "get_report"
]);
```

- [ ] **Step 2: Add failing MCP handler tests**

Append to `tests/mcpHandlers.test.ts`:

```ts
it("runs verify_app and returns structured run data", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "possum-mcp-verify-app-"));
  const targetUrl = await serveHtml("<title>Verify App</title><h1>Hello</h1>");

  const result = await runPossumMcpTool(
    "verify_app",
    { rootDir, targetUrl },
    { now: new Date("2026-06-28T02:00:00.000Z") }
  );

  expect(result.structuredContent).toMatchObject({
    runId: "run_20260628_020000",
    reportMarkdownPath: expect.stringContaining("report.md"),
    findingsJsonPath: expect.stringContaining("findings.json")
  });
});

it("runs verify_feature with injected dependencies and returns verification summary paths", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "possum-mcp-verify-feature-"));

  const result = await runPossumMcpTool(
    "verify_feature",
    {
      rootDir,
      targetUrl: "http://localhost:3000",
      brief: { feature: "Added CSV export", checks: [{ text: "Export CSV button is visible" }] }
    },
    {
      now: new Date("2026-06-28T02:00:00.000Z"),
      resolveFeatureVerification: () => ({
        llm: { async complete() { return { text: "{}" }; } },
        model: "agent-model",
        maxSteps: 5,
        budgetMs: 60_000
      }),
      verifyFeatureImpl: async () => ({
        runId: "run_20260628_020000",
        runDir: join(rootDir, ".possum", "runs", "run_20260628_020000"),
        reportMarkdownPath: join(rootDir, ".possum", "runs", "run_20260628_020000", "report.md"),
        findingsJsonPath: join(rootDir, ".possum", "runs", "run_20260628_020000", "findings.json"),
        verificationJsonPath: join(rootDir, ".possum", "runs", "run_20260628_020000", "verification.json")
      })
    }
  );

  expect(result.structuredContent).toMatchObject({
    runId: "run_20260628_020000",
    reportMarkdownPath: expect.stringContaining("report.md"),
    findingsJsonPath: expect.stringContaining("findings.json"),
    verificationJsonPath: expect.stringContaining("verification.json")
  });
});
```

- [ ] **Step 3: Run focused MCP tests and verify they fail**

Run:

```bash
rtk proxy npm test -- tests/mcp.test.ts tests/mcpHandlers.test.ts
```

Expected: FAIL because MCP tool names and handlers do not exist.

- [ ] **Step 4: Extend MCP dependency type**

In `src/mcp/server.ts`, import new modules:

```ts
import { verifyApp } from "../verification/appVerification.js";
import { runFeatureVerification, RunFeatureVerificationInput } from "../verification/featureVerification.js";
import { FeatureVerificationBriefSchema } from "../verification/types.js";
import { LlmClient } from "../llm/client.js";
```

Add types:

```ts
interface ResolvedFeatureVerificationMcpConfig {
  llm: LlmClient;
  model: string;
  maxSteps: number;
  budgetMs: number;
}

type VerifyFeatureImpl = (input: RunFeatureVerificationInput) => Promise<{
  runId: string;
  runDir: string;
  reportMarkdownPath: string;
  findingsJsonPath: string;
  verificationJsonPath: string;
}>;
```

Extend `PossumMcpDependencies`:

```ts
verifyFeatureImpl?: VerifyFeatureImpl;
verifyAppImpl?: typeof verifyApp;
resolveFeatureVerification?: (target: Awaited<ReturnType<typeof resolveAuditTarget>>) => ResolvedFeatureVerificationMcpConfig;
```

- [ ] **Step 5: Add tool names and schemas**

Update `POSSUM_MCP_TOOL_NAMES`:

```ts
export const POSSUM_MCP_TOOL_NAMES = [
  "run_audit",
  "verify_app",
  "verify_feature",
  "list_findings",
  "get_finding",
  "replay_finding",
  "get_report"
] as const;
```

Add schemas:

```ts
const VerifyFeatureArgsSchema = z.object({
  rootDir: z.string().optional(),
  runCommand: z.string().optional(),
  targetUrl: z.string().url().optional(),
  brief: FeatureVerificationBriefSchema
});
```

`verify_app` can reuse `RunAuditArgsSchema`.

- [ ] **Step 6: Register MCP tools**

In `createPossumMcpServer`, register `verify_app` after `run_audit`:

```ts
  server.registerTool(
    "verify_app",
    {
      description: "Verify app behavior using Possum's app verification workflow.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults MCP server working directory."),
        runCommand: z4.string().optional().describe("Sandboxed command to start local app before verifying."),
        targetUrl: z4.string().url().optional().describe("Local app URL. Defaults to possum.config.json.")
      }
    },
    async (args) => runPossumMcpTool("verify_app", args, dependencies)
  );
```

Register `verify_feature`:

```ts
  server.registerTool(
    "verify_feature",
    {
      description: "Verify a completed feature from a structured brief.",
      inputSchema: {
        rootDir: z4.string().optional().describe("Repository root. Defaults MCP server working directory."),
        runCommand: z4.string().optional().describe("Sandboxed command to start local app before verifying."),
        targetUrl: z4.string().url().optional().describe("Local app URL. Defaults to possum.config.json."),
        brief: z4.object({
          feature: z4.string().min(1),
          pages: z4.array(z4.string()).optional(),
          setup: z4.array(z4.string()).optional(),
          checks: z4
            .array(
              z4.object({
                text: z4.string().min(1),
                hints: z4.record(z4.string(), z4.unknown()).optional()
              })
            )
            .optional()
        })
      }
    },
    async (args) => runPossumMcpTool("verify_feature", args, dependencies)
  );
```

- [ ] **Step 7: Route MCP handlers**

In `runPossumMcpTool`, add cases:

```ts
    case "verify_app":
      return verifyAppTool(rawArgs, dependencies);
    case "verify_feature":
      return verifyFeatureTool(rawArgs, dependencies);
```

Add helper to resolve feature config:

```ts
function resolveFeatureVerificationFromTarget(
  target: Awaited<ReturnType<typeof resolveAuditTarget>>
): ResolvedFeatureVerificationMcpConfig {
  const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
  const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
  const resolved = resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
    requestTimeoutMs,
    budgetMs
  });

  if (!resolved) {
    throw new Error("Feature verification requires models in possum.config.json.");
  }

  return {
    llm: resolved.llm,
    model: resolved.models.personaModel,
    maxSteps: resolved.maxSteps,
    budgetMs: resolved.budgetMs
  };
}
```

Add `verifyAppTool`:

```ts
async function verifyAppTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = RunAuditArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const target = await resolveAuditTarget({ rootDir, runCommand: args.runCommand, targetUrl: args.targetUrl });
  const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
  const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
  const result = await (dependencies.verifyAppImpl ?? verifyApp)({
    rootDir,
    runCommand: target.runCommand,
    targetUrl: target.targetUrl,
    now: dependencies.now,
    claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
      requestTimeoutMs,
      budgetMs
    })
  });

  const report = await readRunReport(createRunStore(rootDir), result.runId);
  return textResult(`Possum app verification created ${result.runId}`, {
    runId: result.runId,
    reportMarkdownPath: result.reportMarkdownPath,
    findingsJsonPath: result.findingsJsonPath,
    findings: report.findings
  });
}
```

Add `verifyFeatureTool`:

```ts
async function verifyFeatureTool(rawArgs: unknown, dependencies: PossumMcpDependencies): Promise<CallToolResult> {
  const args = VerifyFeatureArgsSchema.parse(rawArgs);
  const rootDir = resolveRootDir(args.rootDir, dependencies);
  const target = await resolveAuditTarget({ rootDir, runCommand: args.runCommand, targetUrl: args.targetUrl });
  const resolved = (dependencies.resolveFeatureVerification ?? resolveFeatureVerificationFromTarget)(target);
  const result = await (dependencies.verifyFeatureImpl ?? runFeatureVerification)({
    rootDir,
    runCommand: target.runCommand,
    targetUrl: target.targetUrl,
    brief: args.brief,
    llm: resolved.llm,
    model: resolved.model,
    maxSteps: resolved.maxSteps,
    budgetMs: resolved.budgetMs,
    now: dependencies.now
  });

  return textResult(`Possum feature verification created ${result.runId}`, {
    runId: result.runId,
    reportMarkdownPath: result.reportMarkdownPath,
    findingsJsonPath: result.findingsJsonPath,
    verificationJsonPath: result.verificationJsonPath
  });
}
```

- [ ] **Step 8: Run focused MCP tests and verify they pass**

Run:

```bash
rtk proxy npm test -- tests/mcp.test.ts tests/mcpHandlers.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk proxy git add src/mcp/server.ts tests/mcp.test.ts tests/mcpHandlers.test.ts
rtk proxy git commit -m "feat: add verify feature mcp tool"
```

---

### Task 12: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Optional modify: `docs/agents/claude-code.md`
- Optional modify: `docs/agents/codex.md`

**Interfaces:**
- Consumes: implemented CLI/MCP commands.
- Produces: user-facing docs for pivoted workflow.

- [ ] **Step 1: Update README product language**

In `README.md`, replace the opening description with language matching this shape:

```md
Possum is a browser-based app verifier for coding agents. It runs against a local app, drives the UI like a customer, and writes actionable evidence when behavior does not match what the agent or app says should work.
```

Add a short command list near the existing command examples:

```md
- `possum verify-feature --brief feature.json` verifies a completed feature from a structured brief.
- `possum verify-app` runs whole-app verification. In v0.2 it wraps the current deterministic audit workflow.
- `possum audit` remains as a backwards-compatible alias for the app verification workflow.
```

Add a feature brief example:

```json
{
  "feature": "Added CSV export to reports",
  "pages": ["/reports"],
  "setup": ["Open the Reports page"],
  "checks": [
    {
      "text": "Click Export CSV and confirm a CSV downloads",
      "hints": {
        "clickText": "Export CSV",
        "expectedDownload": ".csv"
      }
    }
  ]
}
```

- [ ] **Step 2: Update agent docs if they mention only audit**

Search:

```bash
rtk proxy rg -n "possum audit|run_audit|verify-feature|verify_app" docs/agents README.md
```

If `docs/agents/claude-code.md` or `docs/agents/codex.md` only instruct agents to use `possum audit`, add this sentence near the workflow instructions:

```md
When you have just completed a specific feature, prefer `possum verify-feature --brief feature.json` (or MCP `verify_feature`) with the feature description, relevant pages, setup steps, and expected checks. Use `possum verify-app` for broader app health checks.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
rtk proxy npm run typecheck
rtk proxy npm test
rtk proxy npm run build
rtk proxy git diff --check
```

Expected: all commands PASS.

- [ ] **Step 4: Commit docs**

```bash
rtk proxy git add README.md docs/agents/claude-code.md docs/agents/codex.md
rtk proxy git commit -m "docs: describe feature verification workflow"
```

If one of the agent docs did not change, omit it from `git add`.

---

## Final Implementation Verification

After all tasks are committed, run:

```bash
rtk proxy npm run typecheck
rtk proxy npm test
rtk proxy npm run build
rtk proxy git diff --check
```

Expected:

- TypeScript exits 0.
- Vitest reports all test files passed.
- Build exits 0 and produces `dist/src/cli/main.js`.
- `git diff --check` prints no whitespace errors.

## Self-Review

- **Spec coverage:**
  - `verify-feature` is implemented in Tasks 2-7 and exposed in Tasks 9 and 11.
  - `verify-app` wrapper is implemented in Task 8 and exposed in Tasks 9 and 11.
  - `audit` compatibility remains because Task 8 only adds optional `runType` to `runAudit` and Task 9 keeps the existing command.
  - Hybrid explicit/inferred checks are covered by Tasks 2, 3, and 7.
  - LLM-driven verifier is covered by Task 4; Playwright adapter by Task 5.
  - Setup phase and inconclusive behavior are covered by Tasks 4 and 7.
  - Failed checks creating normal findings are covered by Tasks 6 and 7.
  - `.possum/runs/<runId>` artifacts and `runType` are covered by Tasks 1 and 7.
  - MCP and CLI surfaces are covered by Tasks 9 and 11.
  - Docs are covered by Task 12.

- **Placeholder scan:** No `TBD`, `TODO`, `FIXME`, or placeholder sections are intentionally present. The word `placeholder` appears only in code/prose about HTML placeholder attributes if introduced by implementation docs.

- **Type consistency:** The plan consistently uses `FeatureVerificationBrief`, `VerificationCheck`, `FeatureVerificationSummary`, `FeatureCheckResult`, `runFeatureVerification`, `verifyFeatureCheck`, `verifyFeatureSetup`, `verifyApp`, `verificationJsonPath`, `runType`, `feature_verification`, and `app_verification`.
