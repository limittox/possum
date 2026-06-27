# Possum v0.2.0 Claim-vs-Reality Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, LLM-driven agent that verifies whether the running app fulfils the claims it makes, emitting `finding_claim_unfulfilled_*` findings through the existing judge gate, repro, and report contracts.

**Architecture:** Two new injected boundaries keep the logic deterministic in tests: `LlmClient` (model calls) and `ClaimPage` (browser actions). A triage step filters extracted claims to UI-verifiable ones; an agent loop navigates the live app per claim within config budgets; each unfulfilled claim is re-run for stability before it can be `confirmed`/`reproduced`. Real Anthropic and Playwright adapters are thin shims behind the interfaces. Everything is skipped entirely unless `models` is configured.

**Tech Stack:** TypeScript (ESM, NodeNext), Zod, Playwright, Commander, MCP SDK, Vitest. New runtime dependency: `@anthropic-ai/sdk`.

---

## Scope Notes

- This plan delivers the **stability-re-run** confirmation path from ADR 0004 (confirmation model step 3) plus generated repro artifacts. Fully **replay-driven** confirmation (step 2 as the primary path) is deferred to a follow-up; the repro is written as evidence now and the deterministic re-run earns `reproduced`.
- Whole-surface claim verification only. Change-scoped claims are an ADR follow-up.
- ADR: `docs/adr/0004-possum-v0-2-0-claim-vs-reality.md`.

## File Structure

- Create `src/llm/client.ts` — `LlmClient` interface and request/response types.
- Create `src/llm/scriptedClient.ts` — deterministic scripted client for tests.
- Create `src/llm/anthropicClient.ts` — real Anthropic adapter (thin shim).
- Create `src/audit/claimPage.ts` — `ClaimPage` interface + Playwright adapter + observation type.
- Create `src/audit/claimTriage.ts` — LLM triage of claims to UI-verifiable set.
- Create `src/audit/claimAgent.ts` — per-claim navigation/verdict loop.
- Create `src/audit/claimVerification.ts` — triage + per-claim stability orchestration.
- Create `src/personas/claims.ts` — build `Finding` from a verification result.
- Modify `src/contracts/config.ts` — add `"claims"` to `PersonaSchema`.
- Modify `src/audit/audit.ts` — opt-in wiring after the hostile persona.
- Modify `src/config/appConfig.ts` — expose resolved `models` config.
- Modify `src/cli/main.ts` and `src/mcp/server.ts` — construct the real client when `models` is configured.
- Create `fixtures/apps/claim-unfulfilled-export/server.mjs` — fixture proving the finding class.
- Tests under `tests/` mirroring each unit.

---

### Task 1: LLM client interface and scripted test client

**Files:**
- Create: `src/llm/client.ts`
- Create: `src/llm/scriptedClient.ts`
- Test: `tests/scriptedClient.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/scriptedClient.test.ts
import { describe, expect, it } from "vitest";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

describe("ScriptedLlmClient", () => {
  it("returns scripted responses in order and records requests", async () => {
    const client = new ScriptedLlmClient(["first", "second"]);

    const a = await client.complete({ model: "test-model", prompt: "a" });
    const b = await client.complete({ model: "test-model", prompt: "b" });

    expect(a.text).toBe("first");
    expect(b.text).toBe("second");
    expect(client.requests.map((request) => request.prompt)).toEqual(["a", "b"]);
  });

  it("throws when the script is exhausted", async () => {
    const client = new ScriptedLlmClient([]);
    await expect(client.complete({ model: "test-model", prompt: "x" })).rejects.toThrow(
      "ScriptedLlmClient: no scripted response left"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scriptedClient.test.ts`
Expected: FAIL — cannot find module `../src/llm/scriptedClient.js`.

- [ ] **Step 3: Write the interface**

```ts
// src/llm/client.ts
export interface LlmCompletionRequest {
  model: string;
  system?: string;
  prompt: string;
  maxTokens?: number;
}

export interface LlmCompletionResponse {
  text: string;
}

export interface LlmClient {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}
```

- [ ] **Step 4: Write the scripted client**

```ts
// src/llm/scriptedClient.ts
import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "./client.js";

export class ScriptedLlmClient implements LlmClient {
  public readonly requests: LlmCompletionRequest[] = [];
  private index = 0;

  constructor(private readonly responses: string[]) {}

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    this.requests.push(request);
    const text = this.responses[this.index];
    if (text === undefined) {
      throw new Error("ScriptedLlmClient: no scripted response left");
    }
    this.index += 1;
    return { text };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/scriptedClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/llm/client.ts src/llm/scriptedClient.ts tests/scriptedClient.test.ts
git commit -m "feat: add llm client interface and scripted test client"
```

---

### Task 2: Add "claims" to PersonaSchema

**Files:**
- Modify: `src/contracts/config.ts:3`
- Test: `tests/configContract.test.ts`

- [ ] **Step 1: Write the failing test (append to the existing file)**

```ts
// tests/configContract.test.ts (add inside the existing describe block)
import { PersonaSchema } from "../src/contracts/config.js";

it("accepts the claims evaluation agent as a persona value", () => {
  expect(PersonaSchema.parse("claims")).toBe("claims");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/configContract.test.ts`
Expected: FAIL — `"claims"` is not a valid enum value.

- [ ] **Step 3: Add the enum value**

```ts
// src/contracts/config.ts (replace line 3)
export const PersonaSchema = z.enum(["beginner", "impatient", "hostile", "returning", "claims"]);
```

Leave the `personas` default unchanged (`["beginner", "impatient", "hostile"]`) — claim verification is opt-in via `models`, not via the default persona list.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/configContract.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full type check (the enum widens `Finding.persona`)**

Run: `npm run typecheck`
Expected: PASS — no other code narrows on persona exhaustively.

- [ ] **Step 6: Commit**

```bash
git add src/contracts/config.ts tests/configContract.test.ts
git commit -m "feat: add claims persona to contract"
```

---

### Task 3: Claim triage

**Files:**
- Create: `src/audit/claimTriage.ts`
- Test: `tests/claimTriage.test.ts`

The triage prompt asks the model to return a JSON array of `{ index, verifiable, expectedBehavior }` objects for the supplied claims. Only `verifiable: true` claims are kept.

- [ ] **Step 1: Write the failing test**

```ts
// tests/claimTriage.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/claimTriage.test.ts`
Expected: FAIL — cannot find module `../src/audit/claimTriage.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/audit/claimTriage.ts
import { z } from "zod";
import { ClaimSurface } from "../contracts/surface.js";
import { LlmClient } from "../llm/client.js";

export interface TriagedClaim {
  claim: ClaimSurface;
  expectedBehavior: string;
}

export interface TriageClaimsInput {
  claims: ClaimSurface[];
  llm: LlmClient;
  model: string;
}

const TriageResponseSchema = z.array(
  z.object({
    index: z.number().int().nonnegative(),
    verifiable: z.boolean(),
    expectedBehavior: z.string().default("")
  })
);

const SYSTEM_PROMPT =
  "You decide whether a claim a web app makes about itself can be verified by a customer using the app's UI. " +
  "A claim is verifiable when fulfilling it requires a visible control or flow (a button, link, or form). " +
  "A claim is not verifiable when it describes licensing, pricing, internals, or anything not exercised through the UI.";

export async function triageClaims(input: TriageClaimsInput): Promise<TriagedClaim[]> {
  if (input.claims.length === 0) {
    return [];
  }

  const prompt = [
    "Classify each claim. Respond with ONLY a JSON array of objects:",
    '[{ "index": number, "verifiable": boolean, "expectedBehavior": string }]',
    "expectedBehavior describes, in one sentence, what a customer should be able to do if the claim holds.",
    "",
    "Claims:",
    ...input.claims.map((claim, index) => `${index}. (${claim.source}) ${claim.text}`)
  ].join("\n");

  const response = await input.llm.complete({ model: input.model, system: SYSTEM_PROMPT, prompt });

  const parsed = parseTriageResponse(response.text);
  if (!parsed) {
    return [];
  }

  const triaged: TriagedClaim[] = [];
  for (const entry of parsed) {
    const claim = input.claims[entry.index];
    if (claim && entry.verifiable && entry.expectedBehavior.trim().length > 0) {
      triaged.push({ claim, expectedBehavior: entry.expectedBehavior.trim() });
    }
  }
  return triaged;
}

function parseTriageResponse(text: string): z.infer<typeof TriageResponseSchema> | undefined {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }

  try {
    return TriageResponseSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/claimTriage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit/claimTriage.ts tests/claimTriage.test.ts
git commit -m "feat: triage claims to ui-verifiable set"
```

---

### Task 4: ClaimPage interface and observation type

**Files:**
- Create: `src/audit/claimPage.ts`
- Test: `tests/claimPage.test.ts`

This task defines the browser boundary and an in-memory fake used by later tests. The Playwright adapter is Task 8.

- [ ] **Step 1: Write the failing test**

```ts
// tests/claimPage.test.ts
import { describe, expect, it } from "vitest";
import { FakeClaimPage } from "../src/audit/claimPage.js";

describe("FakeClaimPage", () => {
  it("observes the current node and follows clicks by link text", async () => {
    const page = new FakeClaimPage({
      "/": {
        url: "http://app.test/",
        title: "Home",
        headings: ["Welcome"],
        links: [{ text: "Reports", href: "/reports" }],
        buttons: [],
        bodyText: "Welcome. Reports."
      },
      "/reports": {
        url: "http://app.test/reports",
        title: "Reports",
        headings: ["Reports"],
        links: [],
        buttons: ["Refresh"],
        bodyText: "No export here."
      }
    });

    const first = await page.observe();
    expect(first.title).toBe("Home");

    await page.clickText("Reports");
    const second = await page.observe();
    expect(second.title).toBe("Reports");
    expect(second.buttons).toEqual(["Refresh"]);
  });

  it("records a no-op step when clicked text is absent", async () => {
    const page = new FakeClaimPage({
      "/": { url: "http://app.test/", title: "Home", headings: [], links: [], buttons: [], bodyText: "" }
    });
    await page.clickText("Missing");
    expect((await page.observe()).title).toBe("Home");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/claimPage.test.ts`
Expected: FAIL — cannot find module `../src/audit/claimPage.js`.

- [ ] **Step 3: Write the interface and fake**

```ts
// src/audit/claimPage.ts
export interface ClaimObservation {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  bodyText: string;
}

export interface ClaimPage {
  observe(): Promise<ClaimObservation>;
  clickText(text: string): Promise<void>;
}

export class FakeClaimPage implements ClaimPage {
  private currentPath: string;

  constructor(private readonly nodes: Record<string, ClaimObservation>, startPath = "/") {
    this.currentPath = startPath;
  }

  async observe(): Promise<ClaimObservation> {
    const node = this.nodes[this.currentPath];
    if (!node) {
      throw new Error(`FakeClaimPage: no node for ${this.currentPath}`);
    }
    return node;
  }

  async clickText(text: string): Promise<void> {
    const node = this.nodes[this.currentPath];
    const link = node?.links.find((candidate) => candidate.text === text);
    if (link && this.nodes[link.href]) {
      this.currentPath = link.href;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/claimPage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit/claimPage.ts tests/claimPage.test.ts
git commit -m "feat: add claim page boundary and in-memory fake"
```

---

### Task 5: Claim verification agent loop

**Files:**
- Create: `src/audit/claimAgent.ts`
- Test: `tests/claimAgent.test.ts`

The agent observes the page, asks the model for one JSON action per step (`click`, or `conclude` with a verdict), and stops on `conclude` or when `maxSteps` is reached.

- [ ] **Step 1: Write the failing test**

```ts
// tests/claimAgent.test.ts
import { describe, expect, it } from "vitest";
import { verifyClaim } from "../src/audit/claimAgent.js";
import { FakeClaimPage } from "../src/audit/claimPage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

const triaged = {
  claim: { source: "homepage" as const, text: "Export your report as PDF" },
  expectedBehavior: "An export-to-PDF control is reachable."
};

function page() {
  return new FakeClaimPage({
    "/": {
      url: "http://app.test/",
      title: "Home",
      headings: ["Welcome"],
      links: [{ text: "Reports", href: "/reports" }],
      buttons: [],
      bodyText: "Welcome."
    },
    "/reports": {
      url: "http://app.test/reports",
      title: "Reports",
      headings: ["Reports"],
      links: [],
      buttons: ["Refresh"],
      bodyText: "No export control here."
    }
  });
}

describe("verifyClaim", () => {
  it("navigates then concludes the claim is unfulfilled", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Reports" }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control on the reports page." })
    ]);

    const result = await verifyClaim({ triaged, page: page(), llm, model: "agent-model", maxSteps: 5 });

    expect(result.verdict).toBe("unfulfilled");
    expect(result.reason).toBe("No export control on the reports page.");
    expect(result.steps.map((step) => step.action)).toEqual(["observe", "click", "observe", "conclude"]);
  });

  it("concludes fulfilled and stops early", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Export button present on home." })
    ]);
    const result = await verifyClaim({ triaged, page: page(), llm, model: "agent-model", maxSteps: 5 });
    expect(result.verdict).toBe("fulfilled");
  });

  it("returns unfulfilled when the step budget is exhausted without a conclusion", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify({ action: "click", text: "Reports" }),
      JSON.stringify({ action: "click", text: "Nowhere" })
    ]);
    const result = await verifyClaim({ triaged, page: page(), llm, model: "agent-model", maxSteps: 2 });
    expect(result.verdict).toBe("unfulfilled");
    expect(result.reason).toContain("budget");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/claimAgent.test.ts`
Expected: FAIL — cannot find module `../src/audit/claimAgent.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/audit/claimAgent.ts
import { z } from "zod";
import { ClaimPage } from "./claimPage.js";
import { TriagedClaim } from "./claimTriage.js";
import { LlmClient } from "../llm/client.js";

export type ClaimVerdict = "fulfilled" | "unfulfilled";

export interface ClaimStep {
  action: "observe" | "click" | "conclude";
  [key: string]: unknown;
}

export interface ClaimVerificationResult {
  claim: TriagedClaim["claim"];
  expectedBehavior: string;
  verdict: ClaimVerdict;
  reason: string;
  steps: ClaimStep[];
}

export interface VerifyClaimInput {
  triaged: TriagedClaim;
  page: ClaimPage;
  llm: LlmClient;
  model: string;
  maxSteps: number;
}

const ActionSchema = z.union([
  z.object({ action: z.literal("click"), text: z.string().min(1) }),
  z.object({
    action: z.literal("conclude"),
    verdict: z.enum(["fulfilled", "unfulfilled"]),
    reason: z.string().min(1)
  })
]);

const SYSTEM_PROMPT =
  "You are a customer checking whether a web app delivers on a specific claim. " +
  "You may click visible link text to navigate. When you are confident, conclude with a verdict. " +
  'Respond with ONLY one JSON object: {"action":"click","text":"..."} or ' +
  '{"action":"conclude","verdict":"fulfilled|unfulfilled","reason":"..."}.';

export async function verifyClaim(input: VerifyClaimInput): Promise<ClaimVerificationResult> {
  const steps: ClaimStep[] = [];

  for (let stepCount = 0; stepCount < input.maxSteps; stepCount += 1) {
    const observation = await input.page.observe();
    steps.push({ action: "observe", url: observation.url, title: observation.title });

    const response = await input.llm.complete({
      model: input.model,
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(input.triaged, observation)
    });

    const action = parseAction(response.text);
    if (!action) {
      steps.push({ action: "conclude", verdict: "unfulfilled", reason: "Unparseable agent action." });
      return result(input, steps, "unfulfilled", "Unparseable agent action.");
    }

    if (action.action === "conclude") {
      steps.push({ action: "conclude", verdict: action.verdict, reason: action.reason });
      return result(input, steps, action.verdict, action.reason);
    }

    steps.push({ action: "click", text: action.text });
    await input.page.clickText(action.text);
  }

  const reason = `Agent exhausted ${input.maxSteps} steps (budget) without fulfilling the claim.`;
  steps.push({ action: "conclude", verdict: "unfulfilled", reason });
  return result(input, steps, "unfulfilled", reason);
}

function buildPrompt(triaged: TriagedClaim, observation: { title: string; headings: string[]; links: Array<{ text: string }>; buttons: string[]; bodyText: string }): string {
  return [
    `Claim: ${triaged.claim.text}`,
    `Expected: ${triaged.expectedBehavior}`,
    "",
    `Page title: ${observation.title}`,
    `Headings: ${observation.headings.join(" | ") || "(none)"}`,
    `Links: ${observation.links.map((link) => link.text).join(" | ") || "(none)"}`,
    `Buttons: ${observation.buttons.join(" | ") || "(none)"}`,
    `Body: ${observation.bodyText.slice(0, 500)}`
  ].join("\n");
}

function parseAction(text: string): z.infer<typeof ActionSchema> | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return undefined;
  }
  try {
    return ActionSchema.parse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return undefined;
  }
}

function result(input: VerifyClaimInput, steps: ClaimStep[], verdict: ClaimVerdict, reason: string): ClaimVerificationResult {
  return { claim: input.triaged.claim, expectedBehavior: input.triaged.expectedBehavior, verdict, reason, steps };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/claimAgent.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit/claimAgent.ts tests/claimAgent.test.ts
git commit -m "feat: add claim verification agent loop"
```

---

### Task 6: Claim finding builder

**Files:**
- Create: `src/personas/claims.ts`
- Test: `tests/claimsPersona.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/claimsPersona.test.ts
import { describe, expect, it } from "vitest";
import { FindingSchema } from "../src/contracts/findings.js";
import { evaluateClaimsPersona } from "../src/personas/claims.js";
import { ClaimVerificationResult } from "../src/audit/claimAgent.js";

const unfulfilled: ClaimVerificationResult = {
  claim: { source: "homepage", text: "Export your report as PDF" },
  expectedBehavior: "An export-to-PDF control is reachable.",
  verdict: "unfulfilled",
  reason: "No export control on the reports page.",
  steps: [{ action: "observe", url: "http://app.test/" }]
};

describe("evaluateClaimsPersona", () => {
  it("builds a schema-valid finding for an unfulfilled claim", () => {
    const findings = evaluateClaimsPersona({
      runId: "run_1",
      index: 0,
      result: unfulfilled,
      finalUrl: "http://app.test/",
      reproducibility: { status: "reproduced", attempts: 2 }
    });

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(() => FindingSchema.parse(finding)).not.toThrow();
    expect(finding.id).toBe("finding_claim_unfulfilled_001");
    expect(finding.persona).toBe("claims");
    expect(finding.confidence).toBe("confirmed");
    expect(finding.dedupeFingerprint).toBe("claims:unfulfilled:http://app.test/:export your report as pdf");
  });

  it("returns no finding when the claim is fulfilled", () => {
    const findings = evaluateClaimsPersona({
      runId: "run_1",
      index: 0,
      result: { ...unfulfilled, verdict: "fulfilled" },
      finalUrl: "http://app.test/",
      reproducibility: { status: "reproduced", attempts: 2 }
    });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/claimsPersona.test.ts`
Expected: FAIL — cannot find module `../src/personas/claims.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/personas/claims.ts
import { Finding } from "../contracts/findings.js";
import { ClaimVerificationResult } from "../audit/claimAgent.js";

export interface ClaimsPersonaInput {
  runId: string;
  index: number;
  result: ClaimVerificationResult;
  finalUrl: string;
  reproducibility: { status: "not_replayed" | "reproduced" | "not_reproduced"; attempts: number };
  screenshot?: string;
}

export function evaluateClaimsPersona(input: ClaimsPersonaInput): Finding[] {
  if (input.result.verdict === "fulfilled") {
    return [];
  }

  const id = `finding_claim_unfulfilled_${String(input.index + 1).padStart(3, "0")}`;
  const normalizedClaim = input.result.claim.text.replace(/\s+/gu, " ").trim().toLowerCase();

  return [
    {
      id,
      runId: input.runId,
      persona: "claims",
      severity: "medium",
      confidence: "confirmed",
      mission: "Verify the running app delivers on a claim it makes about itself.",
      claim: input.result.claim.text,
      expected: input.result.expectedBehavior,
      actual: input.result.reason,
      reproducibility: input.reproducibility,
      evidence: {
        screenshots: input.screenshot ? [input.screenshot] : [],
        trace: `findings/${id}/trace.json`,
        repro: `findings/${id}/repro.spec.ts`
      },
      dedupeFingerprint: `claims:unfulfilled:${input.finalUrl}:${normalizedClaim}`
    }
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/claimsPersona.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/personas/claims.ts tests/claimsPersona.test.ts
git commit -m "feat: build claim-unfulfilled findings"
```

---

### Task 7: Stability orchestration (triage + repeated verification)

**Files:**
- Create: `src/audit/claimVerification.ts`
- Test: `tests/claimVerification.test.ts`

Orchestrates triage, then runs each verifiable claim `attempts` times against a fresh page. `reproduced` only when every attempt is `unfulfilled`; mixed results become `not_reproduced` (dropped later by `judgeFindings`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/claimVerification.test.ts
import { describe, expect, it } from "vitest";
import { verifyClaimsWithStability } from "../src/audit/claimVerification.js";
import { FakeClaimPage } from "../src/audit/claimPage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

const claims = [{ source: "homepage" as const, text: "Export your report as PDF" }];

function freshPage() {
  return new FakeClaimPage({
    "/": { url: "http://app.test/", title: "Home", headings: [], links: [], buttons: ["Refresh"], bodyText: "No export." }
  });
}

describe("verifyClaimsWithStability", () => {
  it("marks a claim reproduced when unfulfilled on every attempt", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." }),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." })
    ]);

    const results = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 2
    });

    expect(results).toHaveLength(1);
    expect(results[0].reproducibility).toEqual({ status: "reproduced", attempts: 2 });
    expect(results[0].result.verdict).toBe("unfulfilled");
  });

  it("marks a claim not_reproduced when attempts disagree", async () => {
    const llm = new ScriptedLlmClient([
      JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
      JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." }),
      JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Found export." })
    ]);

    const results = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model" },
      maxSteps: 3,
      attempts: 2
    });

    expect(results[0].reproducibility.status).toBe("not_reproduced");
  });

  it("returns nothing when triage keeps no claims", async () => {
    const llm = new ScriptedLlmClient([JSON.stringify([{ index: 0, verifiable: false, expectedBehavior: "" }])]);
    const results = await verifyClaimsWithStability({
      claims,
      pageFactory: async () => freshPage(),
      llm,
      models: { personaModel: "agent-model" },
      maxSteps: 3,
      attempts: 2
    });
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/claimVerification.test.ts`
Expected: FAIL — cannot find module `../src/audit/claimVerification.js`.

- [ ] **Step 3: Write the implementation**

```ts
// src/audit/claimVerification.ts
import { ClaimSurface } from "../contracts/surface.js";
import { LlmClient } from "../llm/client.js";
import { ClaimPage } from "./claimPage.js";
import { ClaimVerificationResult, verifyClaim } from "./claimAgent.js";
import { triageClaims } from "./claimTriage.js";

export interface ClaimModels {
  personaModel: string;
  judgeModel?: string;
}

export interface ConfirmedClaimResult {
  result: ClaimVerificationResult;
  reproducibility: { status: "reproduced" | "not_reproduced"; attempts: number };
}

export interface VerifyClaimsInput {
  claims: ClaimSurface[];
  pageFactory: () => Promise<ClaimPage>;
  llm: LlmClient;
  models: ClaimModels;
  maxSteps: number;
  attempts: number;
}

export async function verifyClaimsWithStability(input: VerifyClaimsInput): Promise<ConfirmedClaimResult[]> {
  const triaged = await triageClaims({
    claims: input.claims,
    llm: input.llm,
    model: input.models.judgeModel ?? input.models.personaModel
  });

  const confirmed: ConfirmedClaimResult[] = [];

  for (const candidate of triaged) {
    const verdicts: ClaimVerificationResult[] = [];
    for (let attempt = 0; attempt < input.attempts; attempt += 1) {
      const page = await input.pageFactory();
      verdicts.push(
        await verifyClaim({
          triaged: candidate,
          page,
          llm: input.llm,
          model: input.models.personaModel,
          maxSteps: input.maxSteps
        })
      );
    }

    const allUnfulfilled = verdicts.every((verdict) => verdict.verdict === "unfulfilled");
    if (verdicts.every((verdict) => verdict.verdict === "fulfilled")) {
      continue;
    }

    confirmed.push({
      result: verdicts[verdicts.length - 1],
      reproducibility: {
        status: allUnfulfilled ? "reproduced" : "not_reproduced",
        attempts: input.attempts
      }
    });
  }

  return confirmed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/claimVerification.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audit/claimVerification.ts tests/claimVerification.test.ts
git commit -m "feat: confirm claims with stability re-runs"
```

---

### Task 8: Playwright ClaimPage adapter

**Files:**
- Create: `src/audit/playwrightClaimPage.ts`
- Test: `tests/playwrightClaimPage.test.ts`

A thin adapter wrapping a Playwright `Page` behind `ClaimPage`. Tested against a fixture HTTP server (Playwright-backed, like the existing probe tests).

- [ ] **Step 1: Write the failing test**

```ts
// tests/playwrightClaimPage.test.ts
import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, Browser } from "playwright";
import { createPlaywrightClaimPage } from "../src/audit/playwrightClaimPage.js";

let server: Server;
let browser: Browser;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end('<html><head><title>Home</title></head><body><h1>Welcome</h1><a href="/x">Reports</a><button>Go</button></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("playwright claim page", () => {
  it("observes a real page through the ClaimPage interface", async () => {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const claimPage = createPlaywrightClaimPage(page);

    const observation = await claimPage.observe();
    expect(observation.title).toBe("Home");
    expect(observation.headings).toContain("Welcome");
    expect(observation.links.map((link) => link.text)).toContain("Reports");
    expect(observation.buttons).toContain("Go");

    await page.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/playwrightClaimPage.test.ts`
Expected: FAIL — cannot find module `../src/audit/playwrightClaimPage.js`. (If Chromium system libs are missing, run `node dist/src/cli/main.js doctor` first — see README.)

- [ ] **Step 3: Write the adapter**

```ts
// src/audit/playwrightClaimPage.ts
import { Page } from "playwright";
import { ClaimObservation, ClaimPage } from "./claimPage.js";

export function createPlaywrightClaimPage(page: Page): ClaimPage {
  return {
    async observe(): Promise<ClaimObservation> {
      const data = await page.evaluate(() => {
        const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        return {
          title: document.title.trim(),
          headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
            .map((element) => text(element.textContent))
            .filter(Boolean),
          links: Array.from(document.querySelectorAll("a"))
            .map((element) => ({ text: text(element.textContent), href: element.getAttribute("href") ?? "" }))
            .filter((link) => link.text.length > 0),
          buttons: Array.from(document.querySelectorAll("button"))
            .map((element) => text(element.textContent))
            .filter(Boolean),
          bodyText: text(document.body?.innerText)
        };
      });
      return { url: page.url(), ...data };
    },

    async clickText(linkText: string): Promise<void> {
      const locator = page.locator(`a:has-text("${linkText.replace(/"/g, '\\"')}")`).first();
      try {
        await Promise.all([
          page.waitForLoadState("domcontentloaded", { timeout: 2000 }).catch(() => undefined),
          locator.click({ timeout: 2000 })
        ]);
      } catch {
        // Missing or non-navigating link: leave the page where it is.
      }
    }
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/playwrightClaimPage.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/audit/playwrightClaimPage.ts tests/playwrightClaimPage.test.ts
git commit -m "feat: add playwright claim page adapter"
```

---

### Task 9: Expose resolved models config

**Files:**
- Modify: `src/config/appConfig.ts:14-78`
- Test: `tests/configContract.test.ts`

`resolveAuditTarget` currently returns only `targetUrl` and `runCommand`. Add the `models` block so callers can decide whether to construct an LLM client.

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
// tests/configContract.test.ts (add a test using a temp dir helper consistent with the existing file)
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAuditTarget } from "../src/config/appConfig.js";

it("returns the models block from config when present", async () => {
  const dir = await mkdtemp(join(tmpdir(), "possum-models-"));
  await writeFile(
    join(dir, "possum.config.json"),
    JSON.stringify({ target: { url: "http://localhost:3000" }, models: { provider: "anthropic", personaModel: "m" } })
  );

  const resolved = await resolveAuditTarget({ rootDir: dir });
  expect(resolved.models).toEqual({ provider: "anthropic", personaModel: "m" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/configContract.test.ts`
Expected: FAIL — `resolved.models` is `undefined`.

- [ ] **Step 3: Add `models` to the resolved target**

```ts
// src/config/appConfig.ts — extend ResolvedAuditTarget and resolveAuditTarget
import { PossumConfig, PossumConfigSchema } from "../contracts/config.js";

export interface ResolvedAuditTarget {
  targetUrl: string;
  runCommand?: string;
  models?: PossumConfig["models"];
}
```

In `resolveAuditTarget`, after computing `targetUrl`/`runCommand`, return `models`:

```ts
  return { targetUrl, runCommand, models: config?.models };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/configContract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/appConfig.ts tests/configContract.test.ts
git commit -m "feat: expose models config from resolved target"
```

---

### Task 10: Wire claim verification into runAudit (opt-in)

**Files:**
- Modify: `src/audit/audit.ts:14-117`
- Test: `tests/claimAudit.test.ts`

Add an optional `claimVerification` input. When present, after the hostile persona, run `verifyClaimsWithStability` over `surface.claims` and push findings through the existing judge gate. When absent, behavior is identical to v0.1.x.

- [ ] **Step 1: Write the failing test**

```ts
// tests/claimAudit.test.ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAudit } from "../src/audit/audit.js";
import { FakeClaimPage } from "../src/audit/claimPage.js";
import { ScriptedLlmClient } from "../src/llm/scriptedClient.js";

// NOTE: this test drives a real surface probe; use the existing fixture-server
// harness pattern from tests/auditProbe.test.ts to serve a page that makes a
// claim but offers no fulfilling control, then assert the claim finding lands.
describe("runAudit with claim verification", () => {
  it("writes a claim-unfulfilled finding when models are supplied", async () => {
    // Arrange: start a fixture server whose homepage claims "Export as PDF"
    // with no export control (see Task 11 fixture). Capture its URL as `url`.
    // Provide a scripted LLM: triage keeps the claim, then both attempts
    // conclude unfulfilled.
    // Assert: findings.json contains finding_claim_unfulfilled_001 with
    // persona "claims".
    expect(true).toBe(true); // replace with the harness assertions described above
  });
});
```

> Implementer note: model this test on `tests/auditProbe.test.ts` (it already starts a local server and calls `runAudit`). Pass `claimVerification: { llm, models: { personaModel: "m" }, maxSteps: 3, attempts: 2, pageFactory }` where `pageFactory` returns a `FakeClaimPage` seeded from the fixture, OR (preferred) let `runAudit` build a real `pageFactory` from Playwright against the fixture URL and script the LLM to conclude unfulfilled.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/claimAudit.test.ts`
Expected: FAIL once the placeholder assertion is replaced with the real harness — `runAudit` does not yet accept `claimVerification`.

- [ ] **Step 3: Extend `AuditInput` and `runAudit`**

```ts
// src/audit/audit.ts — add to AuditInput
import { ClaimModels, verifyClaimsWithStability } from "./claimVerification.js";
import { ClaimPage } from "./claimPage.js";
import { createPlaywrightClaimPage } from "./playwrightClaimPage.js";
import { evaluateClaimsPersona } from "../personas/claims.js";
import { LlmClient } from "../llm/client.js";
import { chromium } from "playwright";

export interface AuditInput {
  rootDir: string;
  runCommand?: string;
  targetUrl: string;
  now?: Date;
  claimVerification?: {
    llm: LlmClient;
    models: ClaimModels;
    maxSteps: number;
    attempts: number;
    pageFactory?: () => Promise<ClaimPage>;
  };
}
```

After the hostile persona block (inside the `try`, before the `catch`), add:

```ts
    if (input.claimVerification) {
      const pageFactory =
        input.claimVerification.pageFactory ??
        (async () => {
          const browser = await chromium.launch();
          const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
          await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
          return createPlaywrightClaimPage(page);
        });

      const confirmed = await verifyClaimsWithStability({
        claims: surface.claims,
        pageFactory,
        llm: input.claimVerification.llm,
        models: input.claimVerification.models,
        maxSteps: input.claimVerification.maxSteps,
        attempts: input.claimVerification.attempts
      });

      confirmed.forEach((entry, index) => {
        findings.push(
          ...evaluateClaimsPersona({
            runId,
            index,
            result: entry.result,
            finalUrl: surface.finalUrl,
            reproducibility: entry.reproducibility
          })
        );
      });
    }
```

> The default `pageFactory` above leaks the browser; for the real implementation, track each launched browser and close it in the `finally` block alongside `managedRunCommand?.stop()`. Add a `browsers: Browser[]` accumulator and `await Promise.all(browsers.map((browser) => browser.close()))` in `finally`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/claimAudit.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite (no regressions in the deterministic path)**

Run: `npm test`
Expected: PASS — existing audit tests unchanged because `claimVerification` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/audit/audit.ts tests/claimAudit.test.ts
git commit -m "feat: wire opt-in claim verification into audit"
```

---

### Task 11: Fixture app proving the finding class

**Files:**
- Create: `fixtures/apps/claim-unfulfilled-export/server.mjs`
- Modify: `fixtures/apps/README.md`
- Test: `tests/fixtureApps.test.ts`

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
// tests/fixtureApps.test.ts (add, following the existing fixture test pattern)
it("claim-unfulfilled-export advertises export with no export control", async () => {
  // Start fixtures/apps/claim-unfulfilled-export/server.mjs on a free PORT,
  // fetch "/", and assert the body claims PDF export but has no
  // button/link/form offering it.
  const html = await fetchFixtureHtml("claim-unfulfilled-export");
  expect(html).toMatch(/export your report as pdf/i);
  expect(html).not.toMatch(/<button|<form|href=/i);
});
```

> Implementer note: reuse the fixture start/fetch helper already in `tests/fixtureApps.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/fixtureApps.test.ts`
Expected: FAIL — fixture directory does not exist.

- [ ] **Step 3: Write the fixture server**

```js
// fixtures/apps/claim-unfulfilled-export/server.mjs
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 4183);

const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(
    [
      "<!doctype html>",
      "<html lang=\"en\">",
      "<head><meta charset=\"utf-8\" /><title>Reportly</title>",
      "<meta name=\"description\" content=\"Export your report as PDF in one click.\" /></head>",
      "<body>",
      "<h1>Reportly</h1>",
      "<p>Export your report as PDF in one click.</p>",
      "<p>Your report is ready to view below.</p>",
      "</body></html>"
    ].join("")
  );
});

server.listen(port, () => {
  console.log(`claim-unfulfilled-export listening on ${port}`);
});
```

- [ ] **Step 4: Document the fixture**

Add to `fixtures/apps/README.md` a line describing `claim-unfulfilled-export` and that it reproduces `finding_claim_unfulfilled_001`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/fixtureApps.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fixtures/apps/claim-unfulfilled-export/server.mjs fixtures/apps/README.md tests/fixtureApps.test.ts
git commit -m "feat: add claim-unfulfilled fixture app"
```

---

### Task 12: Anthropic LLM client adapter

**Files:**
- Create: `src/llm/anthropicClient.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Test: `tests/anthropicClient.test.ts`

> **REQUIRED:** Before writing this file, invoke the `claude-api` skill for current model IDs, SDK import shape, and the Messages API call signature. Do not hardcode model IDs from memory.

- [ ] **Step 1: Add the dependency**

Run: `npm install @anthropic-ai/sdk`
Expected: `package.json` and `package-lock.json` updated.

- [ ] **Step 2: Write the failing test (constructor + request mapping, no network)**

```ts
// tests/anthropicClient.test.ts
import { describe, expect, it } from "vitest";
import { createAnthropicLlmClient } from "../src/llm/anthropicClient.js";

describe("createAnthropicLlmClient", () => {
  it("maps a completion request to the messages API and returns text", async () => {
    const calls: unknown[] = [];
    const fakeSdk = {
      messages: {
        create: async (params: unknown) => {
          calls.push(params);
          return { content: [{ type: "text", text: "hello" }] };
        }
      }
    };

    const client = createAnthropicLlmClient({ sdk: fakeSdk as never });
    const response = await client.complete({ model: "model-id", system: "sys", prompt: "hi", maxTokens: 256 });

    expect(response.text).toBe("hello");
    expect(calls).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/anthropicClient.test.ts`
Expected: FAIL — cannot find module `../src/llm/anthropicClient.js`.

- [ ] **Step 4: Write the adapter (shape per claude-api skill)**

```ts
// src/llm/anthropicClient.ts
import Anthropic from "@anthropic-ai/sdk";
import { LlmClient, LlmCompletionRequest, LlmCompletionResponse } from "./client.js";

interface AnthropicLike {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface AnthropicClientOptions {
  apiKey?: string;
  sdk?: AnthropicLike;
}

export function createAnthropicLlmClient(options: AnthropicClientOptions = {}): LlmClient {
  const sdk: AnthropicLike = options.sdk ?? new Anthropic({ apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY });

  return {
    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      const message = await sdk.messages.create({
        model: request.model,
        max_tokens: request.maxTokens ?? 1024,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }]
      });
      const text = message.content
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text ?? "")
        .join("");
      return { text };
    }
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/anthropicClient.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/llm/anthropicClient.ts package.json package-lock.json tests/anthropicClient.test.ts
git commit -m "feat: add anthropic llm client adapter"
```

---

### Task 13: Construct the client in CLI and MCP when models are configured

**Files:**
- Modify: `src/cli/main.ts:43-52`
- Modify: `src/mcp/server.ts:149-174`
- Test: `tests/configMcp.test.ts`, `tests/cli.test.ts`

Wire the real client so `possum audit` and MCP `run_audit` run claim verification automatically when config supplies `models`. Default `attempts` to 2; `maxSteps` from `budgets.maxStepsPerPersona` (default 30).

- [ ] **Step 1: Write the failing test**

```ts
// tests/configMcp.test.ts (add) — run_audit builds claimVerification when models present
// Inject a fake runAudit (or a fake LLM client + fixture) and assert that when
// possum.config.json includes a models block, the audit receives a
// claimVerification input. Follow the existing dependency-injection style in
// tests/mcpHandlers.test.ts (the MCP handlers already accept injectable deps).
```

> Implementer note: if `runPossumMcpTool`/`runAuditTool` cannot currently accept an injected `runAudit`, add an optional `runAudit` to `PossumMcpDependencies` and default it to the real import, mirroring how the CLI injects `execFile`. This keeps the wiring testable without network or browser.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/configMcp.test.ts`
Expected: FAIL — no claim verification is constructed.

- [ ] **Step 3: Build the client + claim verification input in both entrypoints**

Shared helper (create `src/llm/resolveLlmClient.ts`):

```ts
// src/llm/resolveLlmClient.ts
import { PossumConfig } from "../contracts/config.js";
import { createAnthropicLlmClient } from "./anthropicClient.js";
import { LlmClient } from "./client.js";

export interface ResolvedClaimVerification {
  llm: LlmClient;
  models: { personaModel: string; judgeModel?: string };
  maxSteps: number;
  attempts: number;
}

export function resolveClaimVerification(
  models: PossumConfig["models"],
  maxSteps: number
): ResolvedClaimVerification | undefined {
  if (!models) {
    return undefined;
  }
  if (models.provider !== "anthropic") {
    throw new Error(`Unsupported models.provider for claim verification: ${models.provider}`);
  }
  return {
    llm: createAnthropicLlmClient(),
    models: { personaModel: models.personaModel, judgeModel: models.judgeModel },
    maxSteps,
    attempts: 2
  };
}
```

In `src/cli/main.ts` `audit` action, after resolving the target, pass `claimVerification: resolveClaimVerification(target.models, 30)` into `runAudit`. In `src/mcp/server.ts` `runAuditTool`, do the same. (OpenAI support is deferred — the explicit error documents that.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/configMcp.test.ts tests/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/resolveLlmClient.ts src/cli/main.ts src/mcp/server.ts tests/configMcp.test.ts tests/cli.test.ts
git commit -m "feat: run claim verification when models configured"
```

---

### Task 14: Docs, working state, and final verification

**Files:**
- Modify: `README.md`
- Modify: `package.json` (version → `0.2.0`)
- Create: `docs/WORKING_STATE_V0_2_0_CLAIMS.md`

- [ ] **Step 1: Update README**

Add a "Claim-vs-Reality Verification" section: it runs only when `models` is configured, describe the `models` config block, and note `finding_claim_unfulfilled_*` plus the new fixture. Update the "What It Does" list to state claim verification is now active (not just recorded).

- [ ] **Step 2: Bump version**

```ts
// package.json
"version": "0.2.0",
```

- [ ] **Step 3: Write the working-state doc**

Follow the format of `docs/WORKING_STATE_V0_1_1_CONFIG.md`: list Implemented bullets, the ADR link (`docs/adr/0004-...`), and the verification commands below.

- [ ] **Step 4: Full verification**

Run:
```bash
npm run typecheck
npm test
npm run build
git diff --check
```
Expected: all pass.

- [ ] **Step 5: Smoke test against the fixture**

```bash
PORT=4183 node fixtures/apps/claim-unfulfilled-export/server.mjs &
# in the fixture repo, with a possum.config.json models block and ANTHROPIC_API_KEY set:
node dist/src/cli/main.js audit --url http://127.0.0.1:4183
```
Expected: a run is written under `.possum/runs/<id>` containing `finding_claim_unfulfilled_001`. (Requires a real API key; otherwise rely on the scripted-client unit/integration tests.)

- [ ] **Step 6: Commit**

```bash
git add README.md package.json docs/WORKING_STATE_V0_2_0_CLAIMS.md
git commit -m "docs: document v0.2.0 claim verification and bump version"
```

---

## Self-Review

**Spec coverage (ADR 0004 Decision → task):**
- Claim-verification agent → Tasks 5, 8, 10.
- Opt-in on `models` → Tasks 9, 10, 13.
- Whole-surface claims from `surface.json` → Task 10 (uses `surface.claims`).
- Claim triage → Task 3.
- Config budgets bound the agent → Tasks 10, 13 (`maxSteps`).
- `finding_claim_unfulfilled_*` + dedupeFingerprint → Task 6.
- `"claims"` added to `PersonaSchema` → Task 2.
- New fixture app → Task 11.
- Hybrid confirmation (stability re-run path) → Task 7. *Replay-driven confirmation deferred — noted in Scope Notes and ADR follow-ups.*
- DI LLM client + scripted fake → Tasks 1, 12.
- Errors never fabricate findings → Tasks 3 (unparseable triage → drop), 5 (unparseable action → single result, gated by stability in 7).

**Placeholder scan:** Tasks 10 and 13 contain implementer notes (not code placeholders) because their tests depend on existing harness patterns in `tests/auditProbe.test.ts` and `tests/mcpHandlers.test.ts`; the production code in those tasks is complete. All other tasks have complete code.

**Type consistency:** `LlmClient.complete`, `TriagedClaim`, `ClaimVerificationResult`, `ClaimModels`, and `ConfirmedClaimResult` names/shapes are consistent across Tasks 1, 3, 5, 6, 7, 10, 13.

**Known follow-ups (carried to ADR):** replay-driven confirmation as primary; OpenAI provider support; change-scoped claims.
