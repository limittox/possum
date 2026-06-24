# Live Audit Progress Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print live, per-phase progress to stderr while `possum audit` runs, so the operator can see liveness and which stage is executing, without changing the machine-readable result output on stdout and without breaking the MCP server.

**Architecture:** `runAudit` gains an optional injected `onProgress` reporter and emits structured `AuditProgressEvent`s at each phase boundary (it never formats strings). The CLI supplies a reporter that formats events to lines and writes them to stderr; the MCP server supplies none and stays silent (its stdout is the JSON-RPC channel).

**Tech Stack:** TypeScript ESM (NodeNext), Vitest, Commander, Playwright (existing audit probes).

**Spec:** `docs/superpowers/specs/2026-06-17-audit-progress-output-design.md`

---

## File Structure

- Create `src/audit/progress.ts` — the `AuditPhase` / `AuditProgressEvent` types and the `AuditProgressReporter` type. Presentation-free; owned by the audit core.
- Create `src/cli/auditProgress.ts` — `formatProgressEvent(event): string`, the CLI presentation layer (wording + `possum: ` prefix). Depends on `src/audit/progress.ts` types only.
- Modify `src/audit/audit.ts` — add `onProgress?` to `AuditInput`; emit events at each phase boundary and after the judge gate.
- Modify `src/cli/main.ts` — add optional `stderr?` to `CliDependencies`; build an `onProgress` reporter in the `audit` action that formats events to `deps.stderr`; wire `stderr` to `console.error` in the entrypoint.
- Create `tests/auditProgress.test.ts` — unit tests for `formatProgressEvent`.
- Modify `tests/claimAudit.test.ts` — add an event-ordering integration test using a collecting `onProgress`.
- Modify `tests/cli.test.ts` — add a test asserting progress goes to stderr and results stay on stdout.
- `src/mcp/server.ts` — **no change** (it already calls `runAudit` without `onProgress`, so it stays silent).

---

## Task 1: Progress event types (audit core)

**Files:**
- Create: `src/audit/progress.ts`

- [ ] **Step 1: Create the types module**

```ts
export type AuditPhase = "beginner" | "impatient" | "hostile" | "claims";

export type AuditProgressEvent =
  | { type: "app-starting"; command: string }
  | { type: "app-ready" }
  | { type: "phase-start"; phase: AuditPhase; index: number; total: number }
  | { type: "phase-done"; phase: AuditPhase; index: number; total: number; findings: number }
  | { type: "judge-done"; accepted: number; candidates: number };

export type AuditProgressReporter = (event: AuditProgressEvent) => void;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no usages yet, just the new module).

- [ ] **Step 3: Commit**

```bash
git add src/audit/progress.ts
git commit -m "feat: add audit progress event types"
```

---

## Task 2: CLI progress formatter

**Files:**
- Create: `src/cli/auditProgress.ts`
- Test: `tests/auditProgress.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/auditProgress.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/auditProgress.test.ts`
Expected: FAIL — cannot find module `../src/cli/auditProgress.js` / `formatProgressEvent is not a function`.

- [ ] **Step 3: Implement the formatter**

Create `src/cli/auditProgress.ts`:

```ts
import { AuditPhase, AuditProgressEvent } from "../audit/progress.js";

const PHASE_START_LABELS: Record<AuditPhase, string> = {
  beginner: "beginner — loading first screen",
  impatient: "impatient — double-submitting first form",
  hostile: "hostile — submitting unexpected input",
  claims: "claims — verifying app claims"
};

export function formatProgressEvent(event: AuditProgressEvent): string {
  switch (event.type) {
    case "app-starting":
      return `possum: starting app: ${event.command}`;
    case "app-ready":
      return "possum: app ready";
    case "phase-start":
      return `possum: [${event.index}/${event.total}] ${PHASE_START_LABELS[event.phase]}…`;
    case "phase-done":
      return `possum: [${event.index}/${event.total}] ${event.phase} — ${formatOutcome(event.findings)}`;
    case "judge-done":
      return event.candidates === 0
        ? "possum: judge — no findings"
        : `possum: judge — ${event.accepted}/${event.candidates} findings accepted`;
  }
}

function formatOutcome(findings: number): string {
  if (findings === 0) {
    return "ok";
  }
  if (findings === 1) {
    return "1 finding";
  }
  return `${findings} findings`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/auditProgress.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/cli/auditProgress.ts tests/auditProgress.test.ts
git commit -m "feat: add CLI audit progress formatter"
```

---

## Task 3: Emit progress events from runAudit

**Files:**
- Modify: `src/audit/audit.ts`
- Test: `tests/claimAudit.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("runAudit with claim verification", ...)` block in `tests/claimAudit.test.ts` (it reuses the existing `baseUrl` http server):

```ts
it("reports per-phase progress events in order", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "possum-claim-audit-progress-"));

  const llm = new ScriptedLlmClient([
    JSON.stringify([{ index: 0, verifiable: true, expectedBehavior: "An export-to-PDF control is reachable." }]),
    JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." }),
    JSON.stringify({ action: "conclude", verdict: "unfulfilled", reason: "No export control is present." })
  ]);

  const events: import("../src/audit/progress.js").AuditProgressEvent[] = [];

  await runAudit({
    rootDir,
    targetUrl: baseUrl,
    onProgress: (event) => events.push(event),
    claimVerification: {
      llm,
      models: { personaModel: "agent-model", judgeModel: "judge-model" },
      maxSteps: 3,
      attempts: 2
    }
  });

  expect(events).toEqual([
    { type: "phase-start", phase: "beginner", index: 1, total: 4 },
    { type: "phase-done", phase: "beginner", index: 1, total: 4, findings: 0 },
    { type: "phase-start", phase: "impatient", index: 2, total: 4 },
    { type: "phase-done", phase: "impatient", index: 2, total: 4, findings: 0 },
    { type: "phase-start", phase: "hostile", index: 3, total: 4 },
    { type: "phase-done", phase: "hostile", index: 3, total: 4, findings: 0 },
    { type: "phase-start", phase: "claims", index: 4, total: 4 },
    { type: "phase-done", phase: "claims", index: 4, total: 4, findings: 1 },
    { type: "judge-done", accepted: 1, candidates: 1 }
  ]);
}, 30_000);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/claimAudit.test.ts -t "per-phase progress"`
Expected: FAIL — `onProgress` is not a known property / `events` is empty.

- [ ] **Step 3: Add `onProgress` to `AuditInput`**

In `src/audit/audit.ts`, add the import and the field. Add to the import block near the other `./` imports:

```ts
import { AuditProgressEvent } from "./progress.js";
```

Extend `AuditInput` (currently ends at `claimVerification?: AuditClaimVerification;`):

```ts
export interface AuditInput {
  rootDir: string;
  runCommand?: string;
  targetUrl: string;
  now?: Date;
  claimVerification?: AuditClaimVerification;
  onProgress?: (event: AuditProgressEvent) => void;
}
```

- [ ] **Step 4: Emit events at each phase boundary**

In `runAudit`, just after the existing `const claimBrowsers: Browser[] = [];` line, add:

```ts
  const report = input.onProgress ?? (() => {});
  const total = 3 + (input.claimVerification ? 1 : 0);
```

Inside the `try` block, wrap the app-start in events. Replace:

```ts
    if (input.runCommand) {
      managedRunCommand = await startRunCommand({
        command: input.runCommand,
        cwd: input.rootDir,
        targetUrl: input.targetUrl
      });
    }
```

with:

```ts
    if (input.runCommand) {
      report({ type: "app-starting", command: input.runCommand });
      managedRunCommand = await startRunCommand({
        command: input.runCommand,
        cwd: input.rootDir,
        targetUrl: input.targetUrl
      });
      report({ type: "app-ready" });
    }
```

Wrap the beginner phase. Replace:

```ts
    const surface = await probeTargetSurface({
```

with:

```ts
    report({ type: "phase-start", phase: "beginner", index: 1, total });
    const surface = await probeTargetSurface({
```

and replace:

```ts
    surfaceJsonPath = await writeSurface(store, runId, surface);
    findings.push(...evaluateBeginnerPersona({ runId, surface }));
```

with:

```ts
    surfaceJsonPath = await writeSurface(store, runId, surface);
    const beginnerFindings = evaluateBeginnerPersona({ runId, surface });
    findings.push(...beginnerFindings);
    report({ type: "phase-done", phase: "beginner", index: 1, total, findings: beginnerFindings.length });
```

Wrap the impatient phase. Replace:

```ts
    impatientDoubleSubmit = await probeImpatientDoubleSubmit({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, impatientTraceRelativePath),
        relativePath: impatientTraceRelativePath
      }
    });
    findings.push(...evaluateImpatientPersona({ runId, doubleSubmit: impatientDoubleSubmit }));
```

with:

```ts
    report({ type: "phase-start", phase: "impatient", index: 2, total });
    impatientDoubleSubmit = await probeImpatientDoubleSubmit({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, impatientTraceRelativePath),
        relativePath: impatientTraceRelativePath
      }
    });
    const impatientFindings = evaluateImpatientPersona({ runId, doubleSubmit: impatientDoubleSubmit });
    findings.push(...impatientFindings);
    report({ type: "phase-done", phase: "impatient", index: 2, total, findings: impatientFindings.length });
```

Wrap the hostile phase. Replace:

```ts
    hostileValidation = await probeHostileValidation({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, hostileTraceRelativePath),
        relativePath: hostileTraceRelativePath
      }
    });
    findings.push(...evaluateHostilePersona({ runId, validation: hostileValidation }));
```

with:

```ts
    report({ type: "phase-start", phase: "hostile", index: 3, total });
    hostileValidation = await probeHostileValidation({
      targetUrl: input.targetUrl,
      trace: {
        absolutePath: join(store.runsDir, runId, hostileTraceRelativePath),
        relativePath: hostileTraceRelativePath
      }
    });
    const hostileFindings = evaluateHostilePersona({ runId, validation: hostileValidation });
    findings.push(...hostileFindings);
    report({ type: "phase-done", phase: "hostile", index: 3, total, findings: hostileFindings.length });
```

Wrap the claims phase. Replace:

```ts
    if (input.claimVerification) {
      const verification = input.claimVerification;
```

with:

```ts
    if (input.claimVerification) {
      report({ type: "phase-start", phase: "claims", index: 4, total });
      const claimFindingsBefore = findings.length;
      const verification = input.claimVerification;
```

and replace the closing of the claims `forEach` (the block that ends the `if (input.claimVerification)`):

```ts
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

with:

```ts
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
      report({
        type: "phase-done",
        phase: "claims",
        index: 4,
        total,
        findings: findings.length - claimFindingsBefore
      });
    }
```

Finally, emit the judge tally. Replace:

```ts
  const { accepted: acceptedFindings } = judgeFindings(findings);
```

with:

```ts
  const { accepted: acceptedFindings } = judgeFindings(findings);
  report({ type: "judge-done", accepted: acceptedFindings.length, candidates: findings.length });
```

- [ ] **Step 5: Run the ordering test to verify it passes**

Run: `npx vitest run tests/claimAudit.test.ts`
Expected: PASS (all three tests in the file, including the new ordering test).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/audit/audit.ts tests/claimAudit.test.ts
git commit -m "feat: emit per-phase progress events from runAudit"
```

---

## Task 4: Wire progress to stderr in the CLI

**Files:**
- Modify: `src/cli/main.ts`
- Test: `tests/cli.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe("CLI", ...)` block in `tests/cli.test.ts`:

```ts
it("writes audit progress to stderr and results to stdout", async () => {
  const root = await mkdtemp(join(tmpdir(), "possum-cli-progress-"));
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = buildProgram({
    cwd: root,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    now: new Date("2026-06-13T02:00:00.000Z")
  });

  await program.parseAsync(["node", "possum", "audit", "--url", "http://127.0.0.1:9"]);

  // Progress lines go to stderr only.
  expect(stderr.join("\n")).toContain("possum: [1/3] beginner");
  expect(stderr.join("\n")).toContain("possum: judge —");
  // Result lines go to stdout only.
  expect(stdout.join("\n")).toContain("run_20260613_020000");
  expect(stdout.join("\n")).not.toContain("possum: [1/3]");
});
```

Note: `http://127.0.0.1:9` is unreachable, so the surface probe throws and `runAudit` records an access finding. The beginner `phase-start` is still emitted before the probe runs, and `judge-done` is emitted after the gate, so both stderr assertions hold without a live server (mirrors the existing "runs audit and prints the run id" test).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/cli.test.ts -t "progress to stderr"`
Expected: FAIL — `stderr` is not a known property of the deps object / stderr array empty.

- [ ] **Step 3: Add `stderr` to `CliDependencies`**

In `src/cli/main.ts`, extend the interface (currently `stdout: (line: string) => void;`):

```ts
export interface CliDependencies {
  cwd: string;
  stdout: (line: string) => void;
  stderr?: (line: string) => void;
  execFile?: ReplayExecFile;
  now?: Date;
  setExitCode?: (code: number) => void;
}
```

- [ ] **Step 4: Build and pass the progress reporter in the audit action**

Add the import near the other `./` imports in `src/cli/main.ts`:

```ts
import { formatProgressEvent } from "./auditProgress.js";
```

In the `audit` action, replace:

```ts
      const result = await runAudit({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        now: deps.now,
        claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30)
      });
```

with:

```ts
      const emitProgress = deps.stderr;
      const result = await runAudit({
        rootDir: deps.cwd,
        runCommand: target.runCommand,
        targetUrl: target.targetUrl,
        now: deps.now,
        claimVerification: resolveClaimVerification(target.models, target.maxStepsPerPersona ?? 30),
        onProgress: emitProgress ? (event) => emitProgress(formatProgressEvent(event)) : undefined
      });
```

- [ ] **Step 5: Wire `stderr` to `console.error` in the entrypoint**

In `src/cli/main.ts`, the entrypoint block currently is:

```ts
if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  await buildProgram({
    cwd: process.cwd(),
    stdout: (line) => console.log(line)
  }).parseAsync(process.argv);
}
```

Change the `buildProgram` argument to add stderr:

```ts
if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  await buildProgram({
    cwd: process.cwd(),
    stdout: (line) => console.log(line),
    stderr: (line) => console.error(line)
  }).parseAsync(process.argv);
}
```

- [ ] **Step 6: Run the CLI tests to verify they pass**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS (existing CLI tests unchanged + the new progress test).

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/cli/main.ts tests/cli.test.ts
git commit -m "feat: print audit progress to stderr in the CLI"
```

---

## Task 5: Full verification and live smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite**

Run: `npm run typecheck && npm test && npm run build && git diff --check`
Expected: typecheck clean, all tests pass, build emits `dist`, `git diff --check` reports nothing.

- [ ] **Step 2: Live smoke against the fixture (progress on stderr, results on stdout)**

```bash
PORT=4180 node fixtures/apps/beginner-dead-end/server.mjs &
FIXTURE_PID=$!
node dist/src/cli/main.js audit --url http://127.0.0.1:4180 2> /tmp/possum-progress.err 1> /tmp/possum-progress.out
kill "$FIXTURE_PID" 2>/dev/null
echo "=== stderr (progress) ===" && cat /tmp/possum-progress.err
echo "=== stdout (results) ===" && cat /tmp/possum-progress.out
```

Expected: `/tmp/possum-progress.err` shows the `possum: [1/3] beginner …` / `… impatient …` / `… hostile …` / `possum: judge — 1/1 findings accepted` lines; `/tmp/possum-progress.out` shows only the three `Possum audit created …` / `Report: …` / `Surface: …` lines.

- [ ] **Step 3: Update the README**

In `README.md`, under the existing audit/usage description, add a short note that an audit now prints per-phase progress to stderr while results print to stdout (so `possum audit > out.txt` keeps results clean). Keep it to two or three sentences consistent with the surrounding style.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: note audit progress output on stderr"
```

---

## Self-Review Notes

- **Spec coverage:** event model (Task 1), CLI formatter incl. ok/singular/plural/no-findings (Task 2), emission at every phase + app-start + judge (Task 3), stderr/stdout split + injectable `deps.stderr` + entrypoint wiring (Task 4), MCP silence (no change — verified by Task 3 leaving `src/mcp/server.ts` untouched), verification commands + fixture smoke (Task 5).
- **Type consistency:** `AuditProgressEvent`/`AuditPhase`/`AuditProgressReporter` defined in Task 1 and used unchanged in Tasks 2–4; `phase-done` carries `index`/`total`/`findings` consistently in the type, the formatter, and the emission; `formatProgressEvent` signature is identical across formatter test and CLI wiring.
- **MCP:** intentionally unmodified; `runAudit` is called there without `onProgress`, so the default no-op keeps stdout clean for JSON-RPC.
