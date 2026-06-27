# Claims Timeout Budget Progress Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the optional claims persona bounded, timeout-safe, and observable while preserving the rule that infrastructure failures do not create product findings.

**Architecture:** Keep per-request timeouts inside LLM client adapters by constructing clients with `timeoutMs` and using `AbortSignal.timeout()`. Keep wall-clock claims budget inside the claim verification loop with deadline checks at claim and step boundaries. Progress remains event-based: `runAudit` owns phase events, `verifyClaimsWithStability` owns per-claim events, and `verifyClaim` owns per-step heartbeat events.

**Tech Stack:** TypeScript ESM, Node 20, Vitest, Playwright, Zod, Commander, Anthropic SDK, OpenRouter REST API.

---

## File Structure

- Modify `src/contracts/config.ts`: add `budgets.requestTimeoutSeconds` default and keep existing budget defaults.
- Modify `src/config/appConfig.ts`: surface `maxMinutesPerPersona` and `requestTimeoutSeconds` from resolved config.
- Modify `src/llm/resolveLlmClient.ts`: accept timeout/budget options and include `budgetMs` in resolved claim verification.
- Create `src/llm/errors.ts`: shared `LlmTimeoutError` and timeout detection helper.
- Modify `src/llm/openRouterClient.ts`: forward abort signal to `fetch` and map aborts to `LlmTimeoutError`.
- Modify `src/llm/anthropicClient.ts`: pass request `signal` to SDK call and map aborts to `LlmTimeoutError`.
- Modify `src/audit/progress.ts`: add claim-level and claims-truncated progress events.
- Modify `src/cli/auditProgress.ts`: format new progress events as compact stderr lines.
- Modify `src/audit/claimAgent.ts`: add `inconclusive` internal verdict, deadline checks, progress callback, and error-to-inconclusive handling.
- Modify `src/audit/claimVerification.ts`: aggregate inconclusive attempts without findings, enforce wall-clock budget, and return a summary object.
- Modify `src/audit/audit.ts`: pass budget/progress into claim verification and use the new summary object.
- Modify `src/cli/main.ts`: compute `requestTimeoutMs` and `budgetMs` from resolved target budgets.
- Modify `src/mcp/server.ts`: compute the same timeout/budget values for MCP `run_audit`.
- Update tests in `tests/configContract.test.ts`, `tests/resolveLlmClient.test.ts`, `tests/openRouterClient.test.ts`, `tests/anthropicClient.test.ts`, `tests/auditProgress.test.ts`, `tests/claimAgent.test.ts`, `tests/claimVerification.test.ts`, and `tests/claimAudit.test.ts`.

> Command note: project instructions prefer `rtk`. If `rtk` is unavailable in the executor shell, run the same command without the `rtk` prefix.

---

### Task 1: Surface Budget Config

**Files:**
- Modify: `tests/configContract.test.ts`
- Modify: `tests/resolveLlmClient.test.ts`
- Modify: `src/contracts/config.ts`
- Modify: `src/config/appConfig.ts`
- Modify: `src/llm/resolveLlmClient.ts`

- [ ] **Step 1: Write failing config tests**

Add tests to `tests/configContract.test.ts`:

```ts
it("defaults request timeout and persona wall-clock budgets", () => {
  const parsed = PossumConfigSchema.parse({
    target: { url: "http://localhost:3000" }
  });

  expect(parsed.budgets).toEqual({
    maxStepsPerPersona: 30,
    maxMinutesPerPersona: 5,
    requestTimeoutSeconds: 60
  });
});

it("accepts request timeout budget override", () => {
  const parsed = PossumConfigSchema.parse({
    target: { url: "http://localhost:3000" },
    budgets: {
      maxStepsPerPersona: 12,
      maxMinutesPerPersona: 2,
      requestTimeoutSeconds: 7
    }
  });

  expect(parsed.budgets).toEqual({
    maxStepsPerPersona: 12,
    maxMinutesPerPersona: 2,
    requestTimeoutSeconds: 7
  });
});

it("resolves claim timeout and wall-clock budgets from config", async () => {
  const dir = await mkdtemp(join(tmpdir(), "possum-budget-config-"));
  await writeFile(
    join(dir, "possum.config.json"),
    JSON.stringify({
      target: { url: "http://localhost:3000" },
      budgets: {
        maxStepsPerPersona: 11,
        maxMinutesPerPersona: 3,
        requestTimeoutSeconds: 9
      },
      models: { provider: "openrouter", personaModel: "openai/gpt-4o" }
    }),
    "utf8"
  );

  const resolved = await resolveAuditTarget({ rootDir: dir });

  expect(resolved.maxStepsPerPersona).toBe(11);
  expect(resolved.maxMinutesPerPersona).toBe(3);
  expect(resolved.requestTimeoutSeconds).toBe(9);
});
```

- [ ] **Step 2: Write failing LLM resolver tests**

Update `tests/resolveLlmClient.test.ts` so configured providers receive budget data:

```ts
it("includes request timeout and wall-clock budget in claim verification config", () => {
  const resolved = resolveClaimVerification(
    { provider: "openrouter", personaModel: "openai/gpt-4o" },
    25,
    { requestTimeoutMs: 7_000, budgetMs: 120_000 }
  );

  expect(resolved).toBeDefined();
  expect(resolved?.maxSteps).toBe(25);
  expect(resolved?.budgetMs).toBe(120_000);
  expect(resolved?.attempts).toBe(2);
});
```

Also update existing resolver calls to pass `{ requestTimeoutMs: 60_000, budgetMs: 300_000 }` where they expect a resolved client.

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```bash
rtk npm test -- tests/configContract.test.ts tests/resolveLlmClient.test.ts
```

Expected: FAIL because `requestTimeoutSeconds`, `maxMinutesPerPersona` resolution, and the new resolver argument/result do not exist yet.

- [ ] **Step 4: Implement config schema defaults**

In `src/contracts/config.ts`, replace the `budgets` schema with:

```ts
budgets: z
  .object({
    maxStepsPerPersona: z.number().int().positive().default(30),
    maxMinutesPerPersona: z.number().int().positive().default(5),
    requestTimeoutSeconds: z.number().int().positive().default(60)
  })
  .default({
    maxStepsPerPersona: 30,
    maxMinutesPerPersona: 5,
    requestTimeoutSeconds: 60
  }),
```

- [ ] **Step 5: Surface resolved budgets**

In `src/config/appConfig.ts`, extend `ResolvedAuditTarget`:

```ts
export interface ResolvedAuditTarget {
  targetUrl: string;
  runCommand?: string;
  models?: ResolvedModelsConfig;
  maxStepsPerPersona?: number;
  maxMinutesPerPersona?: number;
  requestTimeoutSeconds?: number;
}
```

Update `resolveAuditTarget()` return values so config-backed resolution includes:

```ts
maxStepsPerPersona: config?.budgets.maxStepsPerPersona,
maxMinutesPerPersona: config?.budgets.maxMinutesPerPersona,
requestTimeoutSeconds: config?.budgets.requestTimeoutSeconds
```

When explicit CLI/MCP flags override URL or command, keep the existing override behavior and still source budget values from config.

- [ ] **Step 6: Extend claim verification resolver**

In `src/llm/resolveLlmClient.ts`, introduce options and include `budgetMs`:

```ts
export interface ResolveClaimVerificationOptions {
  requestTimeoutMs: number;
  budgetMs: number;
}

export interface ResolvedClaimVerification {
  llm: LlmClient;
  models: ClaimModels;
  maxSteps: number;
  attempts: number;
  budgetMs: number;
}
```

Change the function signature:

```ts
export function resolveClaimVerification(
  models: ResolvedModelsConfig,
  maxSteps: number,
  options: ResolveClaimVerificationOptions
): ResolvedClaimVerification | undefined
```

Return:

```ts
return {
  llm: createLlmClient(models.provider, options.requestTimeoutMs),
  models: { personaModel: models.personaModel, judgeModel: models.judgeModel },
  maxSteps,
  attempts: DEFAULT_ATTEMPTS,
  budgetMs: options.budgetMs
};
```

Change `createLlmClient`:

```ts
function createLlmClient(provider: NonNullable<ResolvedModelsConfig>["provider"], timeoutMs: number): LlmClient {
  switch (provider) {
    case "anthropic":
      return createAnthropicLlmClient({ timeoutMs });
    case "openrouter":
      return createOpenRouterLlmClient({ title: "Possum", timeoutMs });
    default:
      throw new Error(
        `Unsupported models.provider for claim verification: ${provider}. Supported providers: "anthropic", "openrouter".`
      );
  }
}
```

- [ ] **Step 7: Run focused tests and verify they pass**

Run:

```bash
rtk npm test -- tests/configContract.test.ts tests/resolveLlmClient.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/configContract.test.ts tests/resolveLlmClient.test.ts src/contracts/config.ts src/config/appConfig.ts src/llm/resolveLlmClient.ts
git commit -m "feat: surface claims timeout budgets"
```

---

### Task 2: Add OpenRouter Request Timeout

**Files:**
- Create: `src/llm/errors.ts`
- Modify: `tests/openRouterClient.test.ts`
- Modify: `src/llm/openRouterClient.ts`

- [ ] **Step 1: Write failing OpenRouter timeout tests**

Add to `tests/openRouterClient.test.ts`:

```ts
import { LlmTimeoutError } from "../src/llm/errors.js";
```

Add tests:

```ts
it("passes abort signal when timeout is configured", async () => {
  const { fetchImpl, calls } = okFetch({ choices: [{ message: { content: "hello" } }] });
  const client = createOpenRouterLlmClient({
    apiKey: "key-123",
    fetchImpl,
    timeoutMs: 50
  });

  await client.complete({ model: "openai/gpt-4o", prompt: "hi" });

  expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
});

it("maps abort failures to LlmTimeoutError", async () => {
  const fetchImpl: FetchLike = async (_url, init) => {
    await new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
    throw new Error("unreachable");
  };

  const client = createOpenRouterLlmClient({
    apiKey: "key-123",
    fetchImpl,
    timeoutMs: 1
  });

  await expect(client.complete({ model: "openai/gpt-4o", prompt: "hi" })).rejects.toBeInstanceOf(
    LlmTimeoutError
  );
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk npm test -- tests/openRouterClient.test.ts
```

Expected: FAIL because `src/llm/errors.ts`, `timeoutMs`, and `init.signal` support do not exist.

- [ ] **Step 3: Add shared LLM timeout error**

Create `src/llm/errors.ts`:

```ts
export class LlmTimeoutError extends Error {
  constructor(message = "LLM request timed out.") {
    super(message);
    this.name = "LlmTimeoutError";
  }
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }

  return false;
}
```

- [ ] **Step 4: Implement OpenRouter timeout support**

In `src/llm/openRouterClient.ts`, import the error helpers:

```ts
import { isAbortError, LlmTimeoutError } from "./errors.js";
```

Update `FetchLike`:

```ts
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  }
) => Promise<FetchResponseLike>;
```

Add to `OpenRouterClientOptions`:

```ts
timeoutMs?: number;
```

Before `fetchImpl(...)`, compute:

```ts
const signal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;
```

Wrap the fetch:

```ts
let response: FetchResponseLike;
try {
  response = await fetchImpl(`${options.baseUrl ?? DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens ?? options.maxTokens ?? 1024,
      messages
    }),
    signal
  });
} catch (error) {
  if (isAbortError(error)) {
    throw new LlmTimeoutError();
  }
  throw error;
}
```

- [ ] **Step 5: Run focused test and verify it passes**

Run:

```bash
rtk npm test -- tests/openRouterClient.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/llm/errors.ts src/llm/openRouterClient.ts tests/openRouterClient.test.ts
git commit -m "feat: timeout openrouter llm requests"
```

---

### Task 3: Add Anthropic Request Timeout

**Files:**
- Modify: `tests/anthropicClient.test.ts`
- Modify: `src/llm/anthropicClient.ts`

- [ ] **Step 1: Write failing Anthropic timeout tests**

Add to `tests/anthropicClient.test.ts`:

```ts
import { LlmTimeoutError } from "../src/llm/errors.js";
```

Add tests:

```ts
it("passes abort signal when timeout is configured", async () => {
  const optionsSeen: unknown[] = [];
  const fakeSdk = {
    messages: {
      create: async (_params: Record<string, unknown>, options?: Record<string, unknown>) => {
        optionsSeen.push(options);
        return { content: [{ type: "text", text: "hello" }] };
      }
    }
  };

  const client = createAnthropicLlmClient({ sdk: fakeSdk, timeoutMs: 50 });

  await client.complete({ model: "model-id", prompt: "hi" });

  expect(optionsSeen[0]).toMatchObject({ signal: expect.any(AbortSignal) });
});

it("maps abort failures to LlmTimeoutError", async () => {
  const fakeSdk = {
    messages: {
      create: async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
    }
  };

  const client = createAnthropicLlmClient({ sdk: fakeSdk, timeoutMs: 1 });

  await expect(client.complete({ model: "model-id", prompt: "hi" })).rejects.toBeInstanceOf(
    LlmTimeoutError
  );
});
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk npm test -- tests/anthropicClient.test.ts
```

Expected: FAIL because the SDK type and adapter do not pass a signal or map aborts.

- [ ] **Step 3: Implement Anthropic timeout support**

In `src/llm/anthropicClient.ts`, import:

```ts
import { isAbortError, LlmTimeoutError } from "./errors.js";
```

Update `AnthropicLike`:

```ts
interface AnthropicLike {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        system?: string;
        messages: Array<{ role: "user"; content: string }>;
      },
      options?: { signal?: AbortSignal }
    ): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}
```

Add to `AnthropicClientOptions`:

```ts
timeoutMs?: number;
```

Inside `complete`, compute and pass signal:

```ts
const signal = options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined;

let message: { content: Array<{ type: string; text?: string }> };
try {
  message = await sdk.messages.create(
    {
      model: request.model,
      max_tokens: request.maxTokens ?? options.maxTokens ?? 1024,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }]
    },
    signal ? { signal } : undefined
  );
} catch (error) {
  if (isAbortError(error)) {
    throw new LlmTimeoutError();
  }
  throw error;
}
```

Keep the existing text-block concatenation unchanged.

- [ ] **Step 4: Run focused test and verify it passes**

Run:

```bash
rtk npm test -- tests/anthropicClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/llm/anthropicClient.ts tests/anthropicClient.test.ts
git commit -m "feat: timeout anthropic llm requests"
```

---

### Task 4: Add Claim Progress Event Formatting

**Files:**
- Modify: `tests/auditProgress.test.ts`
- Modify: `src/audit/progress.ts`
- Modify: `src/cli/auditProgress.ts`

- [ ] **Step 1: Write failing progress formatter tests**

Add to `tests/auditProgress.test.ts`:

```ts
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
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
rtk npm test -- tests/auditProgress.test.ts
```

Expected: FAIL because the event union and formatter cases do not exist.

- [ ] **Step 3: Extend progress event types**

In `src/audit/progress.ts`, add:

```ts
export type ClaimProgressVerdict = "fulfilled" | "unfulfilled" | "inconclusive";
```

Extend `AuditProgressEvent`:

```ts
  | { type: "claim-start"; index: number; total: number; claim: string }
  | {
      type: "claim-step";
      index: number;
      total: number;
      attempt: number;
      attempts: number;
      step: number;
      maxSteps: number;
    }
  | { type: "claim-done"; index: number; total: number; verdict: ClaimProgressVerdict }
  | { type: "claims-truncated"; processed: number; total: number };
```

- [ ] **Step 4: Implement CLI formatting**

In `src/cli/auditProgress.ts`, add cases:

```ts
case "claim-start":
  return `possum: claim ${event.index}/${event.total} — "${formatClaimLabel(event.claim)}"`;
case "claim-step":
  return `possum: claim ${event.index}/${event.total} · attempt ${event.attempt}/${event.attempts} · step ${event.step}/${event.maxSteps}...`;
case "claim-done":
  return `possum: claim ${event.index}/${event.total} — ${event.verdict}`;
case "claims-truncated":
  return `possum: claims — budget reached, verified ${event.processed}/${event.total} claims`;
```

Add helper:

```ts
function formatClaimLabel(claim: string): string {
  const compact = claim.replace(/\s+/gu, " ").trim();
  if (compact.length <= 58) {
    return compact;
  }
  return `${compact.slice(0, 55)}...`;
}
```

- [ ] **Step 5: Run focused test and verify it passes**

Run:

```bash
rtk npm test -- tests/auditProgress.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/audit/progress.ts src/cli/auditProgress.ts tests/auditProgress.test.ts
git commit -m "feat: format claims progress events"
```

---

### Task 5: Make Claim Agent Attempts Inconclusive on Infra Failures

**Files:**
- Modify: `tests/claimAgent.test.ts`
- Modify: `src/audit/claimAgent.ts`

- [ ] **Step 1: Write failing tests for thrown LLM and elapsed deadline**

Add a local throwing client to `tests/claimAgent.test.ts`:

```ts
const throwingLlm = {
  async complete() {
    throw new Error("provider timed out");
  }
};
```

Add tests:

```ts
it("returns inconclusive when the llm throws", async () => {
  const result = await verifyClaim({
    triaged,
    page: page(),
    llm: throwingLlm,
    model: "agent-model",
    maxSteps: 5,
    deadline: Date.now() + 60_000
  });

  expect(result.verdict).toBe("inconclusive");
  expect(result.reason).toContain("provider timed out");
  expect(result.steps.at(-1)).toMatchObject({
    action: "conclude",
    verdict: "inconclusive"
  });
});

it("returns inconclusive when wall-clock budget is already reached", async () => {
  const result = await verifyClaim({
    triaged,
    page: page(),
    llm: new ScriptedLlmClient([]),
    model: "agent-model",
    maxSteps: 5,
    deadline: 1_000,
    now: () => 1_000
  });

  expect(result.verdict).toBe("inconclusive");
  expect(result.reason).toBe("wall-clock budget reached");
  expect(result.steps).toEqual([
    {
      action: "conclude",
      verdict: "inconclusive",
      reason: "wall-clock budget reached"
    }
  ]);
});
```

- [ ] **Step 2: Write failing test for per-step progress**

Add:

```ts
it("emits claim-step progress before each agent step", async () => {
  const events: Array<{ step: number; attempt: number }> = [];
  const llm = new ScriptedLlmClient([
    JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Export button present." })
  ]);

  await verifyClaim({
    triaged,
    page: page(),
    llm,
    model: "agent-model",
    maxSteps: 5,
    deadline: Date.now() + 60_000,
    progress: {
      index: 1,
      total: 1,
      attempt: 1,
      attempts: 2,
      onProgress: (event) => {
        if (event.type === "claim-step") {
          events.push({ step: event.step, attempt: event.attempt });
        }
      }
    }
  });

  expect(events).toEqual([{ step: 1, attempt: 1 }]);
});
```

- [ ] **Step 3: Run focused test and verify it fails**

Run:

```bash
rtk npm test -- tests/claimAgent.test.ts
```

Expected: FAIL because `ClaimVerdict` lacks `inconclusive`, and `deadline`, `now`, and `progress` inputs do not exist.

- [ ] **Step 4: Extend claim agent input and verdict**

In `src/audit/claimAgent.ts`, update:

```ts
import { AuditProgressReporter } from "./progress.js";
```

Change:

```ts
export type ClaimVerdict = "fulfilled" | "unfulfilled" | "inconclusive";
```

Extend `VerifyClaimInput`:

```ts
deadline: number;
now?: () => number;
progress?: {
  index: number;
  total: number;
  attempt: number;
  attempts: number;
  onProgress: AuditProgressReporter;
};
```

Keep `ActionSchema` limited to `fulfilled | unfulfilled` so only Possum infrastructure can produce `inconclusive`.

- [ ] **Step 5: Implement deadline, progress, and error handling**

At the top of `verifyClaim`:

```ts
const now = input.now ?? Date.now;
```

Inside the loop, before `observe()`:

```ts
if (now() >= input.deadline) {
  const reason = "wall-clock budget reached";
  steps.push({ action: "conclude", verdict: "inconclusive", reason });
  return result(input, steps, "inconclusive", reason);
}

input.progress?.onProgress({
  type: "claim-step",
  index: input.progress.index,
  total: input.progress.total,
  attempt: input.progress.attempt,
  attempts: input.progress.attempts,
  step: stepCount + 1,
  maxSteps: input.maxSteps
});
```

Wrap the observe/LLM/click work in `try/catch`:

```ts
try {
  const observation = await input.page.observe();
  steps.push({ action: "observe", url: observation.url, title: observation.title });

  const response = await input.llm.complete({
    model: input.model,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(input.triaged, observation)
  });

  const action = parseAction(response.text);
  // keep existing action handling here
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  steps.push({ action: "conclude", verdict: "inconclusive", reason });
  return result(input, steps, "inconclusive", reason);
}
```

For max-step exhaustion, preserve the existing behavior:

```ts
const reason = `Step budget exhausted after ${input.maxSteps} steps.`;
steps.push({ action: "conclude", verdict: "unfulfilled", reason });
return result(input, steps, "unfulfilled", reason);
```

- [ ] **Step 6: Update existing claim agent tests to pass a deadline**

For existing `verifyClaim` calls in `tests/claimAgent.test.ts`, add:

```ts
deadline: Date.now() + 60_000
```

- [ ] **Step 7: Run focused test and verify it passes**

Run:

```bash
rtk npm test -- tests/claimAgent.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/audit/claimAgent.ts tests/claimAgent.test.ts
git commit -m "feat: make claim attempts inconclusive on infra errors"
```

---

### Task 6: Enforce Claims Wall-Clock Budget and Aggregation

**Files:**
- Modify: `tests/claimVerification.test.ts`
- Modify: `src/audit/claimVerification.ts`

- [ ] **Step 1: Update existing tests for summary return type**

In `tests/claimVerification.test.ts`, change existing calls:

```ts
const summary = await verifyClaimsWithStability({
  claims,
  pageFactory: async () => freshPage(),
  llm,
  models: { personaModel: "agent-model", judgeModel: "judge-model" },
  maxSteps: 3,
  attempts: 2,
  budgetMs: 60_000
});

expect(summary.confirmed).toHaveLength(1);
expect(summary.confirmed[0].reproducibility).toEqual({ status: "reproduced", attempts: 2 });
```

Apply the same `summary.confirmed` change to the other existing tests.

- [ ] **Step 2: Write failing test that inconclusive attempts produce no finding**

Add:

```ts
it("skips a claim when any attempt is inconclusive", async () => {
  const llm = new ScriptedLlmClient([
    JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "Export control reachable." }]),
    JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export." })
  ]);

  const throwingPageFactory = async () => {
    throw new Error("browser closed");
  };

  const summary = await verifyClaimsWithStability({
    claims,
    pageFactory: async () => {
      if (llm.requests.length >= 2) {
        return throwingPageFactory();
      }
      return freshPage();
    },
    llm,
    models: { personaModel: "agent-model", judgeModel: "judge-model" },
    maxSteps: 3,
    attempts: 2,
    budgetMs: 60_000
  });

  expect(summary.confirmed).toEqual([]);
  expect(summary.processed).toBe(1);
  expect(summary.total).toBe(1);
  expect(summary.truncated).toBe(false);
});
```

- [ ] **Step 3: Write failing budget cutoff and progress tests**

Add:

```ts
it("stops before the next claim when wall-clock budget is reached", async () => {
  const twoClaims = [
    { source: "homepage" as const, text: "Export your report as PDF" },
    { source: "homepage" as const, text: "Share your report by email" }
  ];
  const llm = new ScriptedLlmClient([
    JSON.stringify([
      { index: 0, verifiable: true, expectedBehavior: "Export control reachable." },
      { index: 1, verifiable: true, expectedBehavior: "Share control reachable." }
    ]),
    JSON.stringify({ action: "conclude", verdict: "fulfilled", reason: "Found export." })
  ]);
  let now = 1_000;
  const events: string[] = [];

  const summary = await verifyClaimsWithStability({
    claims: twoClaims,
    pageFactory: async () => freshPage(),
    llm,
    models: { personaModel: "agent-model", judgeModel: "judge-model" },
    maxSteps: 3,
    attempts: 1,
    budgetMs: 10,
    now: () => now,
    onProgress: (event) => {
      events.push(event.type);
      if (event.type === "claim-done") {
        now = 1_010;
      }
    }
  });

  expect(summary.confirmed).toEqual([]);
  expect(summary.processed).toBe(1);
  expect(summary.total).toBe(2);
  expect(summary.truncated).toBe(true);
  expect(events).toEqual(["claim-start", "claim-step", "claim-done", "claims-truncated"]);
});
```

- [ ] **Step 4: Run focused test and verify it fails**

Run:

```bash
rtk npm test -- tests/claimVerification.test.ts
```

Expected: FAIL because `budgetMs`, `now`, `onProgress`, and summary return values are not implemented.

- [ ] **Step 5: Implement summary types**

In `src/audit/claimVerification.ts`, replace `ConfirmedClaimResult[]` return with:

```ts
export interface VerifyClaimsSummary {
  confirmed: ConfirmedClaimResult[];
  processed: number;
  total: number;
  truncated: boolean;
}
```

Extend `VerifyClaimsInput`:

```ts
budgetMs: number;
now?: () => number;
onProgress?: AuditProgressReporter;
```

Import `AuditProgressReporter`.

- [ ] **Step 6: Implement budget and inconclusive aggregation**

Use this shape:

```ts
export async function verifyClaimsWithStability(input: VerifyClaimsInput): Promise<VerifyClaimsSummary> {
  const triaged = await triageClaims({
    claims: input.claims,
    llm: input.llm,
    model: input.models.judgeModel ?? input.models.personaModel
  });
  const now = input.now ?? Date.now;
  const deadline = now() + input.budgetMs;
  const confirmed: ConfirmedClaimResult[] = [];
  let processed = 0;
  let truncated = false;

  for (const [claimIndex, candidate] of triaged.entries()) {
    if (now() >= deadline) {
      truncated = true;
      input.onProgress?.({ type: "claims-truncated", processed, total: triaged.length });
      break;
    }

    input.onProgress?.({
      type: "claim-start",
      index: claimIndex + 1,
      total: triaged.length,
      claim: candidate.claim.text
    });

    const verdicts: ClaimVerificationResult[] = [];
    for (let attempt = 0; attempt < input.attempts; attempt += 1) {
      const page = await input.pageFactory();
      verdicts.push(
        await verifyClaim({
          triaged: candidate,
          page,
          llm: input.llm,
          model: input.models.personaModel,
          maxSteps: input.maxSteps,
          deadline,
          now,
          progress: input.onProgress
            ? {
                index: claimIndex + 1,
                total: triaged.length,
                attempt: attempt + 1,
                attempts: input.attempts,
                onProgress: input.onProgress
              }
            : undefined
        })
      );
    }

    processed += 1;
    const last = verdicts[verdicts.length - 1];
    input.onProgress?.({
      type: "claim-done",
      index: claimIndex + 1,
      total: triaged.length,
      verdict: last.verdict
    });

    if (verdicts.some((verdict) => verdict.verdict === "inconclusive")) {
      continue;
    }
    if (verdicts.every((verdict) => verdict.verdict === "fulfilled")) {
      continue;
    }

    const allUnfulfilled = verdicts.every((verdict) => verdict.verdict === "unfulfilled");
    confirmed.push({
      result: last,
      reproducibility: {
        status: allUnfulfilled ? "reproduced" : "not_reproduced",
        attempts: input.attempts
      }
    });
  }

  return { confirmed, processed, total: triaged.length, truncated };
}
```

If TypeScript complains that `last` may be undefined, guard with:

```ts
if (!last) {
  continue;
}
```

- [ ] **Step 7: Run focused test and verify it passes**

Run:

```bash
rtk npm test -- tests/claimVerification.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/audit/claimVerification.ts tests/claimVerification.test.ts
git commit -m "feat: enforce claims wall-clock budget"
```

---

### Task 7: Wire Audit, CLI, and MCP to New Claims Controls

**Files:**
- Modify: `tests/claimAudit.test.ts`
- Modify: `src/audit/audit.ts`
- Modify: `src/cli/main.ts`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Update existing claim audit fixtures to include budgetMs**

In `tests/claimAudit.test.ts`, add to every `claimVerification` object:

```ts
budgetMs: 60_000
```

- [ ] **Step 2: Update progress-order integration test**

In the existing claim progress test, update expected events to include claim sub-events:

```ts
expect(events).toEqual([
  { type: "phase-start", phase: "beginner", index: 1, total: 4 },
  { type: "phase-done", phase: "beginner", index: 1, total: 4, findings: 0 },
  { type: "phase-start", phase: "impatient", index: 2, total: 4 },
  { type: "phase-done", phase: "impatient", index: 2, total: 4, findings: 0 },
  { type: "phase-start", phase: "hostile", index: 3, total: 4 },
  { type: "phase-done", phase: "hostile", index: 3, total: 4, findings: 0 },
  { type: "phase-start", phase: "claims", index: 4, total: 4 },
  { type: "claim-start", index: 1, total: 1, claim: "Export your report as PDF" },
  { type: "claim-step", index: 1, total: 1, attempt: 1, attempts: 2, step: 1, maxSteps: 3 },
  { type: "claim-step", index: 1, total: 1, attempt: 2, attempts: 2, step: 1, maxSteps: 3 },
  { type: "claim-done", index: 1, total: 1, verdict: "unfulfilled" },
  { type: "phase-done", phase: "claims", index: 4, total: 4, findings: 1 },
  { type: "judge-done", accepted: 1, candidates: 1 }
]);
```

- [ ] **Step 3: Add integration test for erroring claim client**

Add:

```ts
it("completes audit without claim finding when claim verification is inconclusive", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-inconclusive-"));
  const llm = new ScriptedLlmClient([
    JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." }])
  ]);
  const throwingLlm = {
    requests: llm.requests,
    async complete(request: Parameters<typeof llm.complete>[0]) {
      if (request.model === "judge-model") {
        return llm.complete(request);
      }
      throw new Error("provider timed out");
    }
  };

  const result = await runAudit({
    rootDir,
    targetUrl: baseUrl,
    claimVerification: {
      llm: throwingLlm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 2,
      budgetMs: 60_000
    }
  });

  const report = JSON.parse(await readFile(result.findingsJsonPath, "utf8"));

  expect(report.personas).toEqual(["beginner", "impatient", "hostile", "claims"]);
  expect(report.findings.some((finding: { persona: string }) => finding.persona === "claims")).toBe(false);
});
```

- [ ] **Step 4: Run focused integration test and verify it fails**

Run:

```bash
rtk npm test -- tests/claimAudit.test.ts
```

Expected: FAIL because `runAudit` still expects a bare confirmed array and does not pass `budgetMs`/progress through.

- [ ] **Step 5: Wire `runAudit` to verification summary**

In `src/audit/audit.ts`, extend `AuditClaimVerification`:

```ts
budgetMs: number;
```

Update the call:

```ts
const summary = await verifyClaimsWithStability({
  claims: surface.claims ?? [],
  pageFactory,
  llm: verification.llm,
  models: verification.models,
  maxSteps: verification.maxSteps,
  attempts: verification.attempts,
  budgetMs: verification.budgetMs,
  onProgress: input.onProgress
});

summary.confirmed.forEach((entry, index) => {
  // keep existing evaluateClaimsPersona body
});

report({
  type: "phase-done",
  phase: "claims",
  index: 4,
  total,
  findings: findings.length - claimFindingsBefore
});
```

Keep `claimBrowsers` cleanup in the existing `finally` block unchanged.

- [ ] **Step 6: Wire CLI budgets**

In `src/cli/main.ts`, before calling `resolveClaimVerification`, compute:

```ts
const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
```

Pass:

```ts
claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
  requestTimeoutMs,
  budgetMs
}),
```

- [ ] **Step 7: Wire MCP budgets**

In `src/mcp/server.ts`, mirror the CLI calculation in `runAuditTool`:

```ts
const requestTimeoutMs = (target.requestTimeoutSeconds ?? 60) * 1000;
const budgetMs = (target.maxMinutesPerPersona ?? 5) * 60_000;
```

Pass those values to `resolveClaimVerification`:

```ts
claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30, {
  requestTimeoutMs,
  budgetMs
})
```

- [ ] **Step 8: Run focused integration test and verify it passes**

Run:

```bash
rtk npm test -- tests/claimAudit.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/audit/audit.ts src/cli/main.ts src/mcp/server.ts tests/claimAudit.test.ts
git commit -m "feat: wire claims budget through audit surfaces"
```

---

### Task 8: Final Verification and Documentation Check

**Files:**
- Review: `README.md`
- Review: `docs/superpowers/specs/2026-06-25-claims-timeout-budget-progress-design.md`
- Optional modify: `README.md`

- [ ] **Step 1: Run all focused suites**

Run:

```bash
rtk npm test -- tests/configContract.test.ts tests/resolveLlmClient.test.ts tests/openRouterClient.test.ts tests/anthropicClient.test.ts tests/auditProgress.test.ts tests/claimAgent.test.ts tests/claimVerification.test.ts tests/claimAudit.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:

```bash
rtk npm run typecheck
rtk npm test
rtk npm run build
rtk git diff --check
```

Expected: all commands PASS with no TypeScript errors, no failing tests, successful build, and no whitespace errors.

- [ ] **Step 3: Decide whether README needs a small config note**

Search README for the budgets config example:

```bash
rg -n "maxStepsPerPersona|budgets|models" README.md
```

If the README already documents budgets near model config, update the example to include:

```json
"budgets": {
  "maxStepsPerPersona": 30,
  "maxMinutesPerPersona": 5,
  "requestTimeoutSeconds": 60
}
```

If the README does not document budgets beyond `maxStepsPerPersona`, add one sentence in the Claim-vs-Reality section:

```md
`budgets.maxMinutesPerPersona` bounds the claims phase wall-clock time, and `budgets.requestTimeoutSeconds` bounds each LLM request.
```

- [ ] **Step 4: Run docs verification if README changed**

Run:

```bash
rtk npm run typecheck
rtk npm test
rtk npm run build
rtk git diff --check
```

Expected: PASS.

- [ ] **Step 5: Final commit**

If README changed:

```bash
git add README.md
git commit -m "docs: document claims timeout budgets"
```

If README did not change, do not create an empty commit.

---

## Self-Review

- Spec coverage:
  - Per-request timeout: Tasks 2 and 3 add real `AbortSignal.timeout()` support and timeout-specific tests for OpenRouter and Anthropic.
  - Wall-clock budget: Tasks 1, 6, and 7 surface config, enforce deadline checks, and wire CLI/MCP/audit.
  - Per-step progress: Tasks 4, 5, 6, and 7 add event types, formatter output, claim-step emission, and integration ordering.
  - Infrastructure failures do not fabricate findings: Tasks 5, 6, and 7 make claim attempts inconclusive and skip claim findings.
  - Non-goals preserved: no deterministic persona changes, no triage behavior change, no parallelism.

- Placeholder scan:
  - No red-flag placeholder terms found.
  - Each code-changing step includes concrete code or replacement shape.

- Type consistency:
  - `budgetMs`, `requestTimeoutMs`, `timeoutMs`, `deadline`, `now`, `onProgress`, and `progress` names are consistent across tasks.
  - `ClaimVerdict` includes `inconclusive`; LLM `ActionSchema` remains `fulfilled | unfulfilled`.
  - `verifyClaimsWithStability()` returns `VerifyClaimsSummary` with `confirmed`, `processed`, `total`, and `truncated`.
