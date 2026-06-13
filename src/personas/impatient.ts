import { Finding } from "../contracts/findings.js";
import { DoubleSubmitProbeResult } from "../audit/impatientProbe.js";

export interface ImpatientPersonaInput {
  runId: string;
  doubleSubmit: DoubleSubmitProbeResult;
}

export function evaluateImpatientPersona(input: ImpatientPersonaInput): Finding[] {
  if (input.doubleSubmit.submissionCount < 2) {
    return [];
  }

  const action = input.doubleSubmit.form?.action ?? input.doubleSubmit.targetUrl;
  return [
    {
      id: "finding_impatient_double_submit_001",
      runId: input.runId,
      persona: "impatient",
      severity: "high",
      confidence: "confirmed",
      mission: "Submit the first form twice like an impatient customer.",
      claim: "Submitting a form repeatedly should not duplicate the same customer action.",
      expected: "The app prevents or safely deduplicates rapid duplicate submissions.",
      actual: `The form submitted ${input.doubleSubmit.submissionCount} times when clicked twice quickly.`,
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_impatient_double_submit_001/trace.json",
        repro: "findings/finding_impatient_double_submit_001/repro.spec.ts"
      },
      dedupeFingerprint: `impatient:double-submit:${action}`
    }
  ];
}
