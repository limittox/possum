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
