# Keyboard Persona Design

## Summary

Add a deterministic default `keyboard` persona to Possum's app audit workflow. The persona checks whether a keyboard-only customer can reach and understand visible interactive controls on the first customer-facing page.

The default audit sequence becomes:

```text
beginner → impatient → hostile → keyboard → claims optional
```

This applies to `possum audit`, `possum verify-app`, and any MCP flow that delegates to the app audit path.

## Goals

- Catch high-confidence keyboard accessibility failures without adding a new dependency.
- Make keyboard access a default customer-simulation concern, not an opt-in specialty scan.
- Produce normal Possum findings and artifacts that coding agents can fix.
- Keep the MVP deterministic, fast, and low-noise.
- Support authenticated runs via existing Playwright `storageState` threading.

## Non-goals

- No `axe-core` dependency in this MVP.
- No full WCAG compliance report.
- No visual contrast, color, or screenshot-based focus-ring scoring.
- No screen-reader emulation.
- No LLM-based accessibility judgment.
- No new CLI flags for persona selection.
- No changes to Claude Code hooks or agent pack behavior.

## User Experience

A normal app audit includes keyboard verification by default:

```bash
possum verify-app
possum audit
```

Run reports list the new persona:

```text
Personas: beginner, impatient, hostile, keyboard
```

When claim verification is configured:

```text
Personas: beginner, impatient, hostile, keyboard, claims
```

If the keyboard persona finds no confirmed issue, there is no finding. If it finds a high-confidence issue, the report includes a finding such as:

```text
finding_keyboard_missing_name_001 (keyboard, medium)
```

Finding artifacts follow the same structure as existing findings:

```text
.possum/runs/<runId>/findings/<findingId>/report.md
.possum/runs/<runId>/findings/<findingId>/trace.json
.possum/runs/<runId>/findings/<findingId>/repro.spec.ts
.possum/runs/<runId>/findings/<findingId>/debug.json
.possum/runs/<runId>/findings/<findingId>/repair-hints.md
```

The persona-level trace is saved at:

```text
.possum/runs/<runId>/personas/keyboard/trace.json
```

## Architecture

Add two focused units:

- `src/audit/keyboardProbe.ts` — browser probe that observes controls, tabs through the page, and writes a persona trace.
- `src/personas/keyboard.ts` — deterministic evaluator that converts probe results into Possum findings.

Wire those units into `src/audit/audit.ts` after the hostile persona and before optional claims verification.

Update shared contracts:

- Add `keyboard` to `PersonaSchema`.
- Add `keyboard` to the default `personas` config array for schema defaults.
- Add `keyboard` to `AuditPhase` so progress output can report the phase.

No separate run type is needed. Keyboard findings use the existing `Finding` schema.

## Keyboard Probe

The probe opens the target page in Chromium with the same viewport and optional storage state pattern as existing deterministic probes.

Inputs:

```ts
interface ProbeKeyboardAccessInput {
  targetUrl: string;
  trace?: BrowserArtifact;
  storageState?: string;
}
```

Output:

```ts
interface KeyboardProbeResult {
  targetUrl: string;
  finalUrl?: string;
  controls: KeyboardControl[];
  tabStops: KeyboardTabStop[];
  issues: KeyboardProbeIssue[];
  trace?: string;
  steps: Array<Record<string, unknown>>;
}
```

Controls include visible native and ARIA interactive elements:

- `a[href]`
- `button`
- `input` except hidden inputs
- `textarea`
- `select`
- `summary`
- `[role="button"]`
- `[role="link"]`
- `[role="checkbox"]`
- `[role="radio"]`
- `[role="switch"]`
- `[role="tab"]`
- `[role="menuitem"]`
- `[onclick]`

Each control records:

- stable index
- tag name
- role if present
- type if present
- href if present
- accessible-name heuristic result
- visible text sample
- placeholder/title/aria-label when present
- whether it is disabled
- whether it appears focusable by static attributes
- CSS selector for repro/debugging when available

The probe presses `Tab` up to a bounded count:

```ts
maxTabPresses = min(max(controls.length * 2, 8), 40)
```

For each tab stop, it records:

- active element tag
- role/type/href
- accessible-name heuristic result
- visible text sample
- selector when available

The probe should not fail the whole audit for a page with no controls. It returns no keyboard findings in that case because the beginner persona already covers dead-end first screens.

## Accessible Name Heuristic

Use a deterministic heuristic rather than a full accessibility-tree dependency.

A visible interactive control has a usable name if any of these are non-empty after trimming whitespace:

- `aria-label`
- text from `aria-labelledby` target elements
- associated `<label for="id">` text
- wrapping `<label>` text
- element visible text / `innerText`
- `alt` for image inputs or images inside links/buttons
- `title`
- `placeholder` for text inputs and textareas
- `value` for submit/button/reset inputs

Do not flag disabled controls.

Do not flag hidden inputs.

For links, text from descendant images' `alt` attributes counts as a name.

## Findings

The evaluator emits at most one finding per issue category per run to keep reports focused.

### `finding_keyboard_no_tabbable_control_001`

When:

- The page has at least one visible enabled control, and
- pressing `Tab` never reaches any visible enabled control.

Severity: `high`

Mission:

```text
Use the app without a mouse and reach the first interactive control.
```

Expected:

```text
A keyboard-only customer can tab to a visible enabled control.
```

### `finding_keyboard_missing_name_001`

When:

- At least one visible enabled control has no usable accessible name by the heuristic.

Severity: `medium`

Mission:

```text
Understand controls using keyboard and assistive technology labels.
```

Expected:

```text
Every visible enabled control has a meaningful accessible name.
```

The finding's `actual` text should include up to three example controls.

### `finding_keyboard_non_focusable_control_001`

When:

- A visible enabled custom interactive control is not focusable by static attributes.

Custom controls are:

- ARIA interactive roles listed above
- elements with `onclick`

Native disabled controls are ignored. Native controls are not flagged by this category because browsers handle focusability.

Severity: `medium`

Mission:

```text
Use custom controls with only the keyboard.
```

Expected:

```text
Custom interactive controls are keyboard focusable and operable.
```

## Artifacts and Repro

Persona trace:

```text
personas/keyboard/trace.json
```

Finding evidence paths:

```text
findings/finding_keyboard_<category>_001/trace.json
findings/finding_keyboard_<category>_001/repro.spec.ts
```

The replay spec should navigate to the target URL and assert the same high-level issue:

- missing-name finding: evaluate controls and expect at least one unnamed visible enabled control
- non-focusable finding: evaluate controls and expect at least one non-focusable custom control
- no-tabbable finding: press Tab and expect no visible enabled control becomes focused

The repro does not need to duplicate every trace detail; it only needs to reproduce the failing condition deterministically.

## Progress Output

Update progress totals:

- Without claims: total phases = 4
- With claims: total phases = 5

Progress examples:

```text
possum: [4/4] keyboard …
possum: [4/5] keyboard …
possum: [5/5] claims …
```

## Testing

Add unit tests for:

- accessible-name heuristic recognizes text, aria labels, labels, placeholder, title, image alt, and input values.
- keyboard evaluator emits no finding when there are no controls.
- keyboard evaluator emits missing-name finding with example controls.
- keyboard evaluator emits non-focusable custom-control finding.
- keyboard evaluator emits no-tabbable finding.

Add browser/probe tests for:

- tabbing reaches normal links/buttons.
- unnamed icon button is reported as missing a name.
- custom `div role="button" onclick="..."` without `tabindex` is reported as non-focusable.

Add audit integration tests for:

- `runAudit()` includes `keyboard` in `findings.json` personas by default.
- keyboard phase progress appears in order.
- a fixture app reproduces a keyboard finding.

Add fixture app:

```text
fixtures/apps/keyboard-inaccessible/server.mjs
```

The fixture should expose at least one high-confidence keyboard failure, such as an icon button without an accessible name and a custom role button without `tabindex`.

## Documentation

Update README:

- Add keyboard persona to the list of simulated customers.
- Mention keyboard/accessibility artifacts in what Possum writes.

Update agent docs only if necessary. No agent command changes are required.

## Success Criteria

- `possum audit` and `possum verify-app` run the keyboard persona by default.
- Reports include `keyboard` in the persona list.
- High-confidence keyboard failures become normal confirmed Possum findings.
- Findings include trace/repro/debug/repair artifacts.
- No new runtime dependency is added.
- Existing auth storage state works with the keyboard probe.
- Full verification passes: typecheck, tests, build, and diff check.
