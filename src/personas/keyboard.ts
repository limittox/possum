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
