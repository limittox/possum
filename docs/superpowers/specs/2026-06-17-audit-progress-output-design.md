# Design: Live audit progress output

Date: 2026-06-17

Status: Approved (design)

## Problem

`possum audit` prints nothing while it runs. It emits only three result
lines at the very end (`Possum audit created ...`, `Report: ...`,
`Surface: ...`). The audit drives a headless Chromium through several
personas, which takes time, so the long silent gap reads as a hang. Users
cannot tell whether an audit is working, which phase is slow, or whether it
stalled on an unreachable URL.

## Goal

Print live, per-phase progress while an audit runs, so the operator can see
liveness and know which stage is executing — without changing the
machine-readable result output and without breaking the MCP server.

Non-goals (YAGNI): spinners, color, timestamps, a `--verbose`/`--quiet`
flag, or per-browser-action logging. Progress is always on.

## Architecture

Follow the dependency-injection pattern already used for `stdout`,
`execFile`, and the LLM client.

- `runAudit` stays presentation-free. It gains an optional
  `onProgress?: (event: AuditProgressEvent) => void` on `AuditInput`,
  defaulting to a no-op. The core **emits structured events** at each phase
  boundary; it never formats user-facing strings.
- The **CLI** (`src/cli/main.ts`) supplies an `onProgress` that formats
  events into lines and writes them to **stderr**. The three existing
  result lines stay on **stdout**, so redirecting stdout to a file still
  captures clean machine-readable output while progress shows on the
  terminal.
- The **MCP server** (`src/mcp/server.ts`) supplies **no** reporter, so it
  stays completely silent. This is a hard constraint: MCP speaks JSON-RPC
  over stdout, and progress chatter there would corrupt the protocol.

### Event model

New module `src/audit/progress.ts` defines the event type and a default
no-op reporter:

```ts
export type AuditPhase = "beginner" | "impatient" | "hostile" | "claims";

export type AuditProgressEvent =
  | { type: "app-starting"; command: string }
  | { type: "app-ready" }
  | { type: "phase-start"; phase: AuditPhase; index: number; total: number }
  | { type: "phase-done"; phase: AuditPhase; findings: number }
  | { type: "judge-done"; accepted: number; candidates: number };

export type AuditProgressReporter = (event: AuditProgressEvent) => void;
```

- `total` is `3` for a normal run and `4` when a model is configured (the
  `claims` phase runs). The core owns `index`/`total` because it knows
  whether claim verification is enabled.
- The core owns *structure* (phase id, counts); the CLI owns *wording*
  (human labels per phase).
- `phase-done.findings` is the number of findings that phase produced
  (before the judge gate).

### Emission points in `runAudit`

Within the existing `try` block in `src/audit/audit.ts`:

1. If `input.runCommand` is set: emit `app-starting` before
   `startRunCommand`, `app-ready` after it resolves.
2. `beginner`: emit `phase-start` before `probeTargetSurface`; emit
   `phase-done` after `evaluateBeginnerPersona`, with the count it returned.
3. `impatient`: `phase-start` before `probeImpatientDoubleSubmit`;
   `phase-done` after `evaluateImpatientPersona`.
4. `hostile`: `phase-start` before `probeHostileValidation`; `phase-done`
   after `evaluateHostilePersona`.
5. `claims` (only when `input.claimVerification` is set): `phase-start`
   before `verifyClaimsWithStability`; `phase-done` after the claim findings
   are built, with that count.
6. After `judgeFindings`: emit `judge-done` with `accepted` =
   accepted.length and `candidates` = total findings length.

`index`/`total` are computed up front: `total = 3 + (claimVerification ? 1
: 0)`; phases are numbered in execution order. The `app-starting`/
`app-ready` and `judge-done` events are not phase-numbered.

Reporter calls must never throw into the audit; the core invokes the
reporter directly (the injected reporter is responsible for not throwing),
consistent with how `stdout` is treated elsewhere.

## Output format (CLI)

The CLI formatter maps each event to one line, all prefixed `possum: `, and
writes to stderr. A phase prints a **start line** (liveness while a slow
phase runs) and a short **outcome line** when it finishes — two lines, which
stays correct when stderr is piped to a file (no TTY cursor tricks).

```
possum: starting app: npm run dev
possum: app ready
possum: [1/3] beginner — loading first screen…
possum: [1/3] beginner — 1 finding
possum: [2/3] impatient — double-submitting first form…
possum: [2/3] impatient — ok
possum: [3/3] hostile — submitting unexpected input…
possum: [3/3] hostile — ok
possum: judge — 1/1 findings accepted
```

Mapping rules:

- `app-starting` → `starting app: <command>`
- `app-ready` → `app ready`
- `phase-start` → `[<index>/<total>] <label>…` where `<label>` is the
  per-phase description:
  - beginner → `beginner — loading first screen`
  - impatient → `impatient — double-submitting first form`
  - hostile → `hostile — submitting unexpected input`
  - claims → `claims — verifying app claims`
- `phase-done` → `[<index>/<total>] <phase> — <outcome>` where `<outcome>`
  is `ok` for 0 findings, `1 finding` for 1, `<n> findings` for n.
- `judge-done` → `judge — <accepted>/<candidates> findings accepted`, or
  `judge — no findings` when `candidates` is 0.

The em dash and ellipsis are literal in the output.

## CLI wiring

- `CliDependencies` gains `stderr: (line: string) => void`, mirroring the
  existing `stdout`. The entrypoint wires it to `console.error`.
- The `audit` action builds an `onProgress` reporter that calls
  `formatProgressEvent(event)` and passes the result to `deps.stderr`, and
  passes that reporter to `runAudit`.
- `src/mcp/server.ts` calls `runAudit` without `onProgress`.

## Testing (TDD)

- `formatProgressEvent(event) → string`: pure function; one assertion per
  event variant, including the `ok` / `1 finding` / `n findings` outcomes,
  the `no findings` judge case, and the `claims` label. This is the core
  logic.
- `runAudit` emits the correct event order: extend the existing audit
  integration test with a collecting `onProgress` and assert the sequence
  (`app-*` only when a command is configured; `claims` only when a model is
  configured; `judge-done` last).
- CLI: assert progress lines are written to the injected `deps.stderr` and
  the three result lines remain on `deps.stdout` (add the injectable
  `deps.stderr` so both channels are captured in tests).

## Verification

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

Plus a compiled CLI smoke against the `beginner-dead-end` fixture, asserting
the per-phase lines appear on stderr and the result lines on stdout.
