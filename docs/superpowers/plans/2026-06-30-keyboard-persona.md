# Keyboard Persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic default `keyboard` persona that detects high-confidence keyboard/accessibility failures during `possum audit` and `possum verify-app`.

**Architecture:** Implement a Playwright probe in `src/audit/keyboardProbe.ts` that gathers visible controls, accessible-name heuristics, tab stops, and deterministic issue summaries. Implement a pure evaluator in `src/personas/keyboard.ts` that converts probe issues into normal Possum findings, then wire it into `runAudit()` after hostile and before optional claims.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Node.js `path`, Playwright, Vitest, existing Possum run-store/report/finding contracts.

## Global Constraints

- Keyboard persona is on by default for `possum audit`, `possum verify-app`, and MCP flows that call the app audit path.
- No new runtime dependency is added.
- No `axe-core`, full WCAG report, screen-reader emulation, LLM judgment, or new CLI persona flags.
- Existing Playwright `storageState` auth threading must work with the keyboard probe.
- Existing `.headroom/` and `AGENTS.md` remain untouched.
- Use `/home/yathu/.headroom/bin/rtk proxy` for shell commands.
- Commit after each independently passing task.

---

## File Structure

- Create `src/audit/keyboardProbe.ts`
  - Browser automation and DOM heuristics.
  - Exports probe result/control/issue types and pure helper `evaluateKeyboardControls()` for tests and repro code reuse.
- Create `src/personas/keyboard.ts`
  - Converts `KeyboardProbeResult` into at most one finding per issue category.
- Modify `src/audit/audit.ts`
  - Runs keyboard phase by default.
  - Tracks keyboard probe result for finding trace/repro generation.
  - Adds keyboard to report personas.
- Modify `src/audit/progress.ts`
  - Adds `keyboard` to `AuditPhase`.
- Modify `src/contracts/config.ts`
  - Adds `keyboard` to `PersonaSchema` and default personas array.
- Modify `src/index.ts`
  - Exports keyboard persona module if persona exports are maintained there.
- Create `tests/keyboardProbe.test.ts`
  - Unit and browser probe tests for accessible-name heuristics and issue detection.
- Create `tests/keyboardPersona.test.ts`
  - Pure evaluator tests.
- Modify `tests/auditProgress.test.ts`, `tests/claimAudit.test.ts`, `tests/contracts.test.ts`, `tests/configContract.test.ts`, `tests/auditProbe.test.ts`, and `tests/fixtureApps.test.ts` as needed for default persona/progress expectations.
- Create `fixtures/apps/keyboard-inaccessible/server.mjs`
  - Fixture app with a high-confidence keyboard failure.
- Modify `README.md`
  - Mentions keyboard customer/persona and keyboard/accessibility artifacts.

---

### Task 1: Add keyboard probe and evaluator units

**Files:**
- Create: `src/audit/keyboardProbe.ts`
- Create: `src/personas/keyboard.ts`
- Create: `tests/keyboardProbe.test.ts`
- Create: `tests/keyboardPersona.test.ts`

**Interfaces:**
- Produces from `src/audit/keyboardProbe.ts`:
  - `KeyboardControl`
  - `KeyboardTabStop`
  - `KeyboardProbeIssue`
  - `KeyboardProbeResult`
  - `ProbeKeyboardAccessInput`
  - `probeKeyboardAccess(input): Promise<KeyboardProbeResult>`
  - `evaluateKeyboardControls(controls, tabStops): KeyboardProbeIssue[]`
- Produces from `src/personas/keyboard.ts`:
  - `evaluateKeyboardPersona({ runId, keyboard }): Finding[]`
- Consumes existing `Finding` contract.

- [ ] **Step 1: Write failing keyboard probe tests**

Create `tests/keyboardProbe.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chromium, Browser, Page } from "playwright";
import {
  evaluateKeyboardControls,
  KeyboardControl,
  probeKeyboardAccess
} from "../src/audit/keyboardProbe.js";

let browser: Browser | undefined;
let page: Page | undefined;

async function newPageWithHtml(html: string): Promise<string> {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  return page.url();
}

afterEach(async () => {
  await browser?.close();
  browser = undefined;
  page = undefined;
});

function control(overrides: Partial<KeyboardControl>): KeyboardControl {
  return {
    index: 0,
    tagName: "button",
    selector: "button",
    text: "",
    role: undefined,
    type: undefined,
    href: undefined,
    ariaLabel: undefined,
    title: undefined,
    placeholder: undefined,
    name: "",
    disabled: false,
    visible: true,
    native: true,
    customInteractive: false,
    focusable: true,
    ...overrides
  };
}

describe("keyboard probe", () => {
  it("recognizes accessible names from common label sources", () => {
    const controls: KeyboardControl[] = [
      control({ index: 0, selector: "#text", text: "Save", name: "Save" }),
      control({ index: 1, selector: "#aria", ariaLabel: "Close", name: "Close" }),
      control({ index: 2, selector: "#label", tagName: "input", name: "Email" }),
      control({ index: 3, selector: "#placeholder", tagName: "input", placeholder: "Search", name: "Search" }),
      control({ index: 4, selector: "#title", title: "More options", name: "More options" }),
      control({ index: 5, selector: "#image", tagName: "a", name: "Home" }),
      control({ index: 6, selector: "#value", tagName: "input", type: "submit", name: "Send" })
    ];

    expect(evaluateKeyboardControls(controls, [])).toEqual([]);
  });

  it("reports missing names for visible enabled controls", () => {
    const issues = evaluateKeyboardControls([control({ selector: "button.icon", name: "" })], [
      { index: 0, selector: "button.icon", tagName: "button", name: "" }
    ]);

    expect(issues).toContainEqual({
      kind: "missing_name",
      controls: [expect.objectContaining({ selector: "button.icon" })]
    });
  });

  it("reports non-focusable custom controls", () => {
    const issues = evaluateKeyboardControls([
      control({
        selector: "div[role=button]",
        tagName: "div",
        role: "button",
        native: false,
        customInteractive: true,
        focusable: false,
        name: "Open"
      })
    ], []);

    expect(issues).toContainEqual({
      kind: "non_focusable_control",
      controls: [expect.objectContaining({ selector: "div[role=button]" })]
    });
  });

  it("reports no tabbable control when controls exist but tab reaches none", () => {
    const issues = evaluateKeyboardControls([control({ selector: "button", name: "Save" })], []);

    expect(issues).toContainEqual({
      kind: "no_tabbable_control",
      controls: [expect.objectContaining({ selector: "button" })]
    });
  });

  it("does not report issues for pages without controls", () => {
    expect(evaluateKeyboardControls([], [])).toEqual([]);
  });

  it("tabs to normal links and buttons", async () => {
    const targetUrl = await newPageWithHtml(`
      <a href="#start">Start</a>
      <button>Continue</button>
    `);
    const root = await mkdtemp(join(tmpdir(), "possum-keyboard-probe-"));

    const result = await probeKeyboardAccess({
      targetUrl,
      trace: {
        absolutePath: join(root, "keyboard-trace.json"),
        relativePath: "keyboard-trace.json"
      }
    });

    expect(result.controls.map((item) => item.name)).toEqual(["Start", "Continue"]);
    expect(result.tabStops.length).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
    await expect(readFile(join(root, "keyboard-trace.json"), "utf8")).resolves.toContain("tabStops");
  });

  it("reports unnamed icon button from browser probe", async () => {
    const targetUrl = await newPageWithHtml(`<button><svg aria-hidden="true"></svg></button>`);

    const result = await probeKeyboardAccess({ targetUrl });

    expect(result.issues).toContainEqual({
      kind: "missing_name",
      controls: [expect.objectContaining({ tagName: "button" })]
    });
  });

  it("reports custom role button without tabindex from browser probe", async () => {
    const targetUrl = await newPageWithHtml(`<div role="button" onclick="window.clicked = true">Open menu</div>`);

    const result = await probeKeyboardAccess({ targetUrl });

    expect(result.issues).toContainEqual({
      kind: "non_focusable_control",
      controls: [expect.objectContaining({ role: "button", focusable: false })]
    });
  });
});
```

- [ ] **Step 2: Write failing keyboard persona tests**

Create `tests/keyboardPersona.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KeyboardProbeResult } from "../src/audit/keyboardProbe.js";
import { evaluateKeyboardPersona } from "../src/personas/keyboard.js";

function result(overrides: Partial<KeyboardProbeResult>): KeyboardProbeResult {
  return {
    targetUrl: "http://localhost:3000",
    finalUrl: "http://localhost:3000/",
    controls: [],
    tabStops: [],
    issues: [],
    trace: "personas/keyboard/trace.json",
    steps: [],
    ...overrides
  };
}

const unnamedControl = {
  index: 0,
  tagName: "button",
  selector: "button.icon",
  text: "",
  role: undefined,
  type: undefined,
  href: undefined,
  ariaLabel: undefined,
  title: undefined,
  placeholder: undefined,
  name: "",
  disabled: false,
  visible: true,
  native: true,
  customInteractive: false,
  focusable: true
};

describe("keyboard persona", () => {
  it("emits no findings without keyboard issues", () => {
    expect(evaluateKeyboardPersona({ runId: "run_keyboard", keyboard: result({}) })).toEqual([]);
  });

  it("emits missing-name finding with example controls", () => {
    const findings = evaluateKeyboardPersona({
      runId: "run_keyboard",
      keyboard: result({
        controls: [unnamedControl],
        issues: [{ kind: "missing_name", controls: [unnamedControl] }]
      })
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "finding_keyboard_missing_name_001",
      persona: "keyboard",
      severity: "medium",
      evidence: {
        trace: "findings/finding_keyboard_missing_name_001/trace.json",
        repro: "findings/finding_keyboard_missing_name_001/repro.spec.ts"
      }
    });
    expect(findings[0].actual).toContain("button.icon");
  });

  it("emits non-focusable custom control finding", () => {
    const customControl = {
      ...unnamedControl,
      selector: "div[role=button]",
      tagName: "div",
      role: "button",
      name: "Open menu",
      native: false,
      customInteractive: true,
      focusable: false
    };

    const findings = evaluateKeyboardPersona({
      runId: "run_keyboard",
      keyboard: result({ issues: [{ kind: "non_focusable_control", controls: [customControl] }] })
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "finding_keyboard_non_focusable_control_001",
      persona: "keyboard",
      severity: "medium"
    });
  });

  it("emits no-tabbable-control finding", () => {
    const findings = evaluateKeyboardPersona({
      runId: "run_keyboard",
      keyboard: result({ issues: [{ kind: "no_tabbable_control", controls: [unnamedControl] }] })
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "finding_keyboard_no_tabbable_control_001",
      persona: "keyboard",
      severity: "high"
    });
  });
});
```

- [ ] **Step 3: Run new tests and verify they fail**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/keyboardProbe.test.ts tests/keyboardPersona.test.ts
```

Expected: FAIL with missing modules `keyboardProbe.js` and `keyboard.js`.

- [ ] **Step 4: Implement keyboard probe**

Create `src/audit/keyboardProbe.ts` with:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";

interface BrowserArtifact {
  absolutePath: string;
  relativePath: string;
}

export interface KeyboardControl {
  index: number;
  tagName: string;
  selector?: string;
  text: string;
  role?: string;
  type?: string;
  href?: string;
  ariaLabel?: string;
  title?: string;
  placeholder?: string;
  name: string;
  disabled: boolean;
  visible: boolean;
  native: boolean;
  customInteractive: boolean;
  focusable: boolean;
}

export interface KeyboardTabStop {
  index: number;
  selector?: string;
  tagName: string;
  role?: string;
  type?: string;
  href?: string;
  name: string;
}

export type KeyboardProbeIssueKind = "missing_name" | "non_focusable_control" | "no_tabbable_control";

export interface KeyboardProbeIssue {
  kind: KeyboardProbeIssueKind;
  controls: KeyboardControl[];
}

export interface KeyboardProbeResult {
  targetUrl: string;
  finalUrl?: string;
  controls: KeyboardControl[];
  tabStops: KeyboardTabStop[];
  issues: KeyboardProbeIssue[];
  trace?: string;
  steps: Array<Record<string, unknown>>;
}

export interface ProbeKeyboardAccessInput {
  targetUrl: string;
  trace?: BrowserArtifact;
  storageState?: string;
}

export async function probeKeyboardAccess(input: ProbeKeyboardAccessInput): Promise<KeyboardProbeResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...(input.storageState ? { storageState: input.storageState } : {}) });
  const steps: Array<Record<string, unknown>> = [];

  try {
    const response = await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
    if (!response) {
      throw new Error("Target did not return a response");
    }
    if (!response.ok()) {
      throw new Error(`Target returned HTTP ${response.status()}`);
    }

    const finalUrl = page.url();
    steps.push({ action: "navigate", url: input.targetUrl, finalUrl, status: response.status(), title: await page.title() });

    const controls = await page.evaluate(collectKeyboardControlsInPage);
    const maxTabPresses = Math.min(Math.max(controls.length * 2, 8), 40);
    const tabStops: KeyboardTabStop[] = [];
    const seenSelectors = new Set<string>();

    for (let index = 0; index < maxTabPresses; index += 1) {
      await page.keyboard.press("Tab");
      const tabStop = await page.evaluate((tabIndex) => collectActiveElementTabStop(tabIndex), index);
      if (!tabStop) {
        continue;
      }
      const key = tabStop.selector ?? `${tabStop.tagName}:${tabStop.name}:${index}`;
      if (seenSelectors.has(key)) {
        continue;
      }
      seenSelectors.add(key);
      tabStops.push(tabStop);
    }

    steps.push({ action: "tab", maxTabPresses, tabStops: tabStops.length });
    const issues = evaluateKeyboardControls(controls, tabStops);
    const result: KeyboardProbeResult = {
      targetUrl: input.targetUrl,
      finalUrl,
      controls,
      tabStops,
      issues,
      trace: input.trace?.relativePath,
      steps
    };
    await writeTrace(input, result);
    return result;
  } finally {
    await browser.close();
  }
}

export function evaluateKeyboardControls(
  controls: KeyboardControl[],
  tabStops: KeyboardTabStop[]
): KeyboardProbeIssue[] {
  const enabledVisibleControls = controls.filter((control) => control.visible && !control.disabled);
  if (enabledVisibleControls.length === 0) {
    return [];
  }

  const issues: KeyboardProbeIssue[] = [];
  const missingName = enabledVisibleControls.filter((control) => control.name.trim().length === 0);
  if (missingName.length > 0) {
    issues.push({ kind: "missing_name", controls: missingName });
  }

  const nonFocusableCustom = enabledVisibleControls.filter(
    (control) => control.customInteractive && !control.native && !control.focusable
  );
  if (nonFocusableCustom.length > 0) {
    issues.push({ kind: "non_focusable_control", controls: nonFocusableCustom });
  }

  const hasVisibleEnabledTabStop = tabStops.some((tabStop) =>
    enabledVisibleControls.some((control) => tabStop.selector !== undefined && control.selector === tabStop.selector)
  );
  if (!hasVisibleEnabledTabStop) {
    issues.push({ kind: "no_tabbable_control", controls: enabledVisibleControls });
  }

  return issues;
}

async function writeTrace(input: ProbeKeyboardAccessInput, result: KeyboardProbeResult): Promise<void> {
  if (!input.trace) {
    return;
  }
  await mkdir(dirname(input.trace.absolutePath), { recursive: true });
  await writeFile(input.trace.absolutePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function collectKeyboardControlsInPage(): KeyboardControl[] {
  const selectors = [
    "a[href]",
    "button",
    "input:not([type='hidden'])",
    "textarea",
    "select",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='tab']",
    "[role='menuitem']",
    "[onclick]"
  ];

  return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
    .filter((element, index, all) => all.indexOf(element) === index)
    .map((element, index) => describeKeyboardControl(element, index))
    .filter((control) => control.visible);
}

function collectActiveElementTabStop(index: number): KeyboardTabStop | undefined {
  const element = document.activeElement;
  if (!element || !(element instanceof HTMLElement) || element === document.body || element === document.documentElement) {
    return undefined;
  }
  if (!isVisible(element)) {
    return undefined;
  }
  const control = describeKeyboardControl(element, index);
  return {
    index,
    selector: control.selector,
    tagName: control.tagName,
    role: control.role,
    type: control.type,
    href: control.href,
    name: control.name
  };
}

function describeKeyboardControl(element: HTMLElement, index: number): KeyboardControl {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role") ?? undefined;
  const input = element instanceof HTMLInputElement ? element : undefined;
  const type = input?.type || element.getAttribute("type") || undefined;
  const disabled = isDisabled(element);
  const native = isNativeControl(element);
  const customInteractive = isCustomInteractive(element);

  return {
    index,
    tagName,
    selector: getStableSelector(element),
    text: compactText(element.innerText || element.textContent || ""),
    role,
    type,
    href: element instanceof HTMLAnchorElement ? element.href : undefined,
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    title: element.getAttribute("title") ?? undefined,
    placeholder: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder || undefined : undefined,
    name: computeAccessibleName(element),
    disabled,
    visible: isVisible(element),
    native,
    customInteractive,
    focusable: isFocusable(element)
  };
}

function computeAccessibleName(element: HTMLElement): string {
  const candidates = [
    element.getAttribute("aria-label"),
    getAriaLabelledByText(element),
    getAssociatedLabelText(element),
    getWrappingLabelText(element),
    element.innerText || element.textContent,
    getDescendantImageAltText(element),
    element.getAttribute("title"),
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : undefined,
    element instanceof HTMLInputElement && ["submit", "button", "reset"].includes(element.type) ? element.value : undefined
  ];

  return compactText(candidates.find((candidate) => compactText(candidate ?? "").length > 0) ?? "");
}

function getAriaLabelledByText(element: HTMLElement): string {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  return compactText(ids.map((id) => document.getElementById(id)?.innerText ?? document.getElementById(id)?.textContent ?? "").join(" "));
}

function getAssociatedLabelText(element: HTMLElement): string {
  const id = element.getAttribute("id");
  if (!id) {
    return "";
  }
  return compactText(
    Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`))
      .map((label) => label.innerText || label.textContent || "")
      .join(" ")
  );
}

function getWrappingLabelText(element: HTMLElement): string {
  const label = element.closest("label");
  return compactText(label?.innerText ?? label?.textContent ?? "");
}

function getDescendantImageAltText(element: HTMLElement): string {
  return compactText(
    Array.from(element.querySelectorAll<HTMLImageElement>("img[alt]"))
      .map((image) => image.alt)
      .join(" ")
  );
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function isDisabled(element: HTMLElement): boolean {
  return (
    element.hasAttribute("disabled") ||
    element.getAttribute("aria-disabled") === "true" ||
    (element instanceof HTMLButtonElement && element.disabled) ||
    (element instanceof HTMLInputElement && element.disabled) ||
    (element instanceof HTMLTextAreaElement && element.disabled) ||
    (element instanceof HTMLSelectElement && element.disabled)
  );
}

function isNativeControl(element: HTMLElement): boolean {
  return (
    element instanceof HTMLAnchorElement ||
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.tagName.toLowerCase() === "summary"
  );
}

function isCustomInteractive(element: HTMLElement): boolean {
  return (
    ["button", "link", "checkbox", "radio", "switch", "tab", "menuitem"].includes(element.getAttribute("role") ?? "") ||
    element.hasAttribute("onclick")
  );
}

function isFocusable(element: HTMLElement): boolean {
  if (isDisabled(element)) {
    return false;
  }
  const tabindex = element.getAttribute("tabindex");
  if (tabindex !== null) {
    return Number.parseInt(tabindex, 10) >= 0;
  }
  if (element instanceof HTMLAnchorElement) {
    return element.hasAttribute("href");
  }
  return isNativeControl(element);
}

function getStableSelector(element: HTMLElement): string | undefined {
  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }
  const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-cy");
  if (testId) {
    return `[data-testid="${cssEscape(testId)}"]`;
  }
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  if (role) {
    return `${tag}[role="${cssEscape(role)}"]`;
  }
  const parent = element.parentElement;
  const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === element.tagName) : [];
  const index = siblings.indexOf(element) + 1;
  return siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 5: Implement keyboard persona evaluator**

Create `src/personas/keyboard.ts`:

```ts
import { KeyboardControl, KeyboardProbeIssue, KeyboardProbeResult } from "../audit/keyboardProbe.js";
import { Finding } from "../contracts/findings.js";

export interface KeyboardPersonaInput {
  runId: string;
  keyboard: KeyboardProbeResult;
}

export function evaluateKeyboardPersona(input: KeyboardPersonaInput): Finding[] {
  return input.keyboard.issues.map((issue) => createFinding(input.runId, issue));
}

function createFinding(runId: string, issue: KeyboardProbeIssue): Finding {
  switch (issue.kind) {
    case "missing_name":
      return {
        id: "finding_keyboard_missing_name_001",
        runId,
        persona: "keyboard",
        severity: "medium",
        confidence: "confirmed",
        mission: "Understand controls using keyboard and assistive technology labels.",
        claim: "Visible interactive controls should have meaningful accessible names.",
        expected: "Every visible enabled control has a meaningful accessible name.",
        actual: `Visible enabled controls are missing accessible names: ${formatExamples(issue.controls)}.`,
        reproducibility: { status: "reproduced", attempts: 1 },
        evidence: {
          screenshots: [],
          trace: "findings/finding_keyboard_missing_name_001/trace.json",
          repro: "findings/finding_keyboard_missing_name_001/repro.spec.ts"
        },
        dedupeFingerprint: `keyboard:missing-name:${formatFingerprintControls(issue.controls)}`
      };
    case "non_focusable_control":
      return {
        id: "finding_keyboard_non_focusable_control_001",
        runId,
        persona: "keyboard",
        severity: "medium",
        confidence: "confirmed",
        mission: "Use custom controls with only the keyboard.",
        claim: "Custom interactive controls should be reachable by keyboard.",
        expected: "Custom interactive controls are keyboard focusable and operable.",
        actual: `Custom controls are not keyboard focusable: ${formatExamples(issue.controls)}.`,
        reproducibility: { status: "reproduced", attempts: 1 },
        evidence: {
          screenshots: [],
          trace: "findings/finding_keyboard_non_focusable_control_001/trace.json",
          repro: "findings/finding_keyboard_non_focusable_control_001/repro.spec.ts"
        },
        dedupeFingerprint: `keyboard:non-focusable:${formatFingerprintControls(issue.controls)}`
      };
    case "no_tabbable_control":
      return {
        id: "finding_keyboard_no_tabbable_control_001",
        runId,
        persona: "keyboard",
        severity: "high",
        confidence: "confirmed",
        mission: "Use the app without a mouse and reach the first interactive control.",
        claim: "A keyboard-only customer should be able to reach visible controls.",
        expected: "A keyboard-only customer can tab to a visible enabled control.",
        actual: `The page has visible enabled controls but Tab did not reach them. Examples: ${formatExamples(issue.controls)}.`,
        reproducibility: { status: "reproduced", attempts: 1 },
        evidence: {
          screenshots: [],
          trace: "findings/finding_keyboard_no_tabbable_control_001/trace.json",
          repro: "findings/finding_keyboard_no_tabbable_control_001/repro.spec.ts"
        },
        dedupeFingerprint: `keyboard:no-tabbable:${formatFingerprintControls(issue.controls)}`
      };
  }
}

function formatExamples(controls: KeyboardControl[]): string {
  return controls.slice(0, 3).map(formatControl).join("; ");
}

function formatControl(control: KeyboardControl): string {
  const parts = [
    control.selector ?? control.tagName,
    control.role ? `role=${control.role}` : undefined,
    control.type ? `type=${control.type}` : undefined,
    control.text ? `text=${JSON.stringify(control.text)}` : undefined
  ].filter((part): part is string => part !== undefined);
  return parts.join(" ");
}

function formatFingerprintControls(controls: KeyboardControl[]): string {
  return controls
    .slice(0, 3)
    .map((control) => control.selector ?? `${control.tagName}:${control.role ?? ""}:${control.type ?? ""}`)
    .join("|");
}
```

- [ ] **Step 6: Run new tests and fix type issues**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/keyboardProbe.test.ts tests/keyboardPersona.test.ts
/home/yathu/.headroom/bin/rtk proxy npm run typecheck
```

Expected: PASS for both test files and typecheck.

- [ ] **Step 7: Commit keyboard probe/evaluator units**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy git add src/audit/keyboardProbe.ts src/personas/keyboard.ts tests/keyboardProbe.test.ts tests/keyboardPersona.test.ts
/home/yathu/.headroom/bin/rtk proxy git commit -m "feat: add keyboard persona probe"
```

---

### Task 2: Wire keyboard persona into audits and contracts

**Files:**
- Modify: `src/audit/audit.ts`
- Modify: `src/audit/progress.ts`
- Modify: `src/contracts/config.ts`
- Modify: `src/index.ts`
- Modify: `tests/contracts.test.ts`
- Modify: `tests/configContract.test.ts`
- Modify: `tests/auditProgress.test.ts`
- Modify: `tests/claimAudit.test.ts`
- Modify: `tests/auditProbe.test.ts`

**Interfaces:**
- Consumes from Task 1:
  - `probeKeyboardAccess()`
  - `KeyboardProbeResult`
  - `evaluateKeyboardPersona()`
- Produces:
  - Default report personas include `keyboard`.
  - Progress includes `keyboard` phase.
  - Keyboard finding traces/repros are generated.

- [ ] **Step 1: Update contracts and progress types**

Modify `src/contracts/config.ts`:

```ts
export const PersonaSchema = z.enum(["beginner", "impatient", "hostile", "keyboard", "returning", "claims", "feature"]);
```

Change the default personas array to:

```ts
personas: z.array(PersonaSchema).default(["beginner", "impatient", "hostile", "keyboard"]),
```

Modify `src/audit/progress.ts`:

```ts
export type AuditPhase = "beginner" | "impatient" | "hostile" | "keyboard" | "claims";
```

Modify `src/index.ts` to export the new persona module:

```ts
export * from "./personas/keyboard.js";
```

- [ ] **Step 2: Write/update failing audit integration expectations**

Update existing tests that expect default personas or progress totals.

Likely changes:

- `tests/contracts.test.ts`: default report/persona tests should accept `keyboard` in `PersonaSchema`.
- `tests/configContract.test.ts`: default config personas should become `['beginner', 'impatient', 'hostile', 'keyboard']`.
- `tests/auditProgress.test.ts`: phase totals without claims become 4 and include keyboard.
- `tests/claimAudit.test.ts`: claim verification report personas become `['beginner', 'impatient', 'hostile', 'keyboard', 'claims']`.
- `tests/auditProbe.test.ts`: default audit report personas include `keyboard`.

Use exact assertions once actual files are inspected during implementation.

- [ ] **Step 3: Run targeted tests and verify they fail before audit wiring**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/contracts.test.ts tests/configContract.test.ts tests/auditProgress.test.ts tests/claimAudit.test.ts tests/auditProbe.test.ts
```

Expected: FAIL where runtime audit has not yet produced keyboard phase/persona.

- [ ] **Step 4: Wire keyboard phase into `runAudit()`**

Modify `src/audit/audit.ts` imports:

```ts
import { evaluateKeyboardPersona } from "../personas/keyboard.js";
import { KeyboardProbeResult, probeKeyboardAccess } from "./keyboardProbe.js";
```

Add state near existing probe result variables:

```ts
let keyboardAccess: KeyboardProbeResult | undefined;
```

Change total:

```ts
const total = 4 + (input.claimVerification ? 1 : 0);
```

Add trace relative path near other trace paths:

```ts
const keyboardTraceRelativePath = "personas/keyboard/trace.json";
```

After hostile phase, add keyboard phase:

```ts
report({ type: "phase-start", phase: "keyboard", index: 4, total });
keyboardAccess = await probeKeyboardAccess({
  targetUrl: input.targetUrl,
  storageState: input.storageState,
  trace: {
    absolutePath: join(store.runsDir, runId, keyboardTraceRelativePath),
    relativePath: keyboardTraceRelativePath
  }
});
const keyboardFindings = evaluateKeyboardPersona({ runId, keyboard: keyboardAccess });
findings.push(...keyboardFindings);
report({ type: "phase-done", phase: "keyboard", index: 4, total, findings: keyboardFindings.length });
```

Change claims index from 4 to 5:

```ts
report({ type: "phase-start", phase: "claims", index: 5, total });
...
report({ type: "phase-done", phase: "claims", index: 5, total, findings: findings.length - claimFindingsBefore });
```

Change final personas:

```ts
personas: input.claimVerification
  ? ["beginner", "impatient", "hostile", "keyboard", "claims"]
  : ["beginner", "impatient", "hostile", "keyboard"],
```

- [ ] **Step 5: Include keyboard context in finding traces and repros**

Change `createFindingTrace()` signature in `src/audit/audit.ts` context to include keyboard:

```ts
context: {
  hostileValidation?: HostileProbeResult;
  impatientDoubleSubmit?: DoubleSubmitProbeResult;
  keyboardAccess?: KeyboardProbeResult;
} = {}
```

Add cases:

```ts
if (finding.id.startsWith("finding_keyboard_") && context.keyboardAccess) {
  return context.keyboardAccess;
}
```

Pass context in `writeFindingArtifacts()`:

```ts
trace: createFindingTrace(input.targetUrl, finding, { hostileValidation, impatientDoubleSubmit, keyboardAccess }),
```

Add keyboard repro cases in `createFindingRepro()`:

```ts
if (finding.id === "finding_keyboard_missing_name_001") {
  return createKeyboardMissingNameRepro(targetUrl);
}
if (finding.id === "finding_keyboard_non_focusable_control_001") {
  return createKeyboardNonFocusableRepro(targetUrl);
}
if (finding.id === "finding_keyboard_no_tabbable_control_001") {
  return createKeyboardNoTabbableRepro(targetUrl);
}
```

Add helper functions that return Playwright specs using browser-side DOM checks. Keep them deterministic and self-contained.

- [ ] **Step 6: Run targeted audit/contract tests**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/contracts.test.ts tests/configContract.test.ts tests/auditProgress.test.ts tests/claimAudit.test.ts tests/auditProbe.test.ts
/home/yathu/.headroom/bin/rtk proxy npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit audit wiring**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy git add src/audit/audit.ts src/audit/progress.ts src/contracts/config.ts src/index.ts tests/contracts.test.ts tests/configContract.test.ts tests/auditProgress.test.ts tests/claimAudit.test.ts tests/auditProbe.test.ts
/home/yathu/.headroom/bin/rtk proxy git commit -m "feat: run keyboard persona by default"
```

---

### Task 3: Add keyboard fixture and documentation

**Files:**
- Create: `fixtures/apps/keyboard-inaccessible/server.mjs`
- Modify: `fixtures/apps/README.md`
- Modify: `tests/fixtureApps.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes default keyboard audit behavior from Task 2.
- Produces fixture regression coverage and public docs.

- [ ] **Step 1: Create keyboard-inaccessible fixture**

Create `fixtures/apps/keyboard-inaccessible/server.mjs`:

```js
import http from "node:http";

export function createFixtureServer() {
  return http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <title>Keyboard Inaccessible Fixture</title>
    <style>
      body { font-family: sans-serif; margin: 2rem; }
      .icon-button { width: 40px; height: 40px; }
      .custom-action { display: inline-block; margin-top: 1rem; padding: 0.5rem 1rem; background: #1f2937; color: white; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Keyboard Inaccessible Fixture</h1>
    <p>This fixture includes controls a keyboard/accessibility pass should flag.</p>
    <button class="icon-button"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"></circle></svg></button>
    <div role="button" class="custom-action" onclick="document.body.dataset.clicked = 'true'">Open menu</div>
  </body>
</html>`);
  });
}
```

- [ ] **Step 2: Add fixture regression test**

In `tests/fixtureApps.test.ts`, add:

```ts
  it("keyboard-inaccessible fixture reproduces a keyboard finding", async () => {
    const ids = await auditFixture("keyboard-inaccessible");

    expect(ids).toContain("finding_keyboard_missing_name_001");
  }, 30_000);
```

- [ ] **Step 3: Update fixture README**

Add a short row/bullet to `fixtures/apps/README.md` describing `keyboard-inaccessible` as a fixture for unnamed controls/custom non-focusable controls.

- [ ] **Step 4: Update README**

In `README.md`, update the feature list line:

```md
- Simulates beginner, impatient, hostile, keyboard-only, returning customers.
```

Also update artifact wording to mention keyboard traces if a suitable sentence exists; otherwise add:

```md
- Checks keyboard accessibility basics such as tab reachability, accessible names, and focusable custom controls.
```

- [ ] **Step 5: Run fixture and docs checks**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm test -- tests/fixtureApps.test.ts
/home/yathu/.headroom/bin/rtk proxy grep -n "keyboard" README.md fixtures/apps/README.md
```

Expected: fixture tests pass and docs contain keyboard mentions.

- [ ] **Step 6: Run full verification**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy npm run typecheck
/home/yathu/.headroom/bin/rtk proxy npm test
/home/yathu/.headroom/bin/rtk proxy npm run build
/home/yathu/.headroom/bin/rtk proxy git diff --check
```

Expected: all pass.

- [ ] **Step 7: Commit fixture and docs**

Run:

```bash
/home/yathu/.headroom/bin/rtk proxy git add fixtures/apps/keyboard-inaccessible/server.mjs fixtures/apps/README.md tests/fixtureApps.test.ts README.md
/home/yathu/.headroom/bin/rtk proxy git commit -m "docs: describe keyboard persona"
```

---

## Plan Self-Review

- Spec coverage: plan covers default keyboard persona, deterministic probe, accessible-name heuristic, three finding categories, artifacts/repro, progress output, fixture, docs, no new dependency, and full verification.
- Placeholder scan: no `TBD`, unresolved TODOs, or vague implementation-only steps remain. The word `placeholder` appears only as an HTML accessibility attribute in test/design content.
- Type consistency: `KeyboardProbeResult`, `KeyboardControl`, `KeyboardProbeIssue`, and `evaluateKeyboardPersona()` are defined in Task 1 and consumed consistently in Task 2.
- Scope check: the plan intentionally excludes axe-core, full WCAG, visual contrast, screen-reader emulation, LLM judgment, and CLI flag changes.
