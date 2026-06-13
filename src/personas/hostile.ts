import { Finding } from "../contracts/findings.js";
import { HostileProbeResult } from "../audit/hostileProbe.js";

export interface HostilePersonaInput {
  runId: string;
  validation: HostileProbeResult;
}

export function evaluateHostilePersona(input: HostilePersonaInput): Finding[] {
  const firstServerError = input.validation.serverErrors[0];
  if (!firstServerError) {
    return [];
  }

  return [
    {
      id: "finding_hostile_server_error_001",
      runId: input.runId,
      persona: "hostile",
      severity: "high",
      confidence: "confirmed",
      mission: "Submit unexpected input and watch for error-page failures.",
      claim: "Unexpected customer input should be validated without exposing a server error.",
      expected: "The app rejects unexpected input with a controlled validation response.",
      actual: `Submitting unexpected input produced HTTP ${firstServerError.status} from ${firstServerError.url}.`,
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: [],
        trace: "findings/finding_hostile_server_error_001/trace.json",
        repro: "findings/finding_hostile_server_error_001/repro.spec.ts"
      },
      dedupeFingerprint: `hostile:server-error:${firstServerError.method}:${firstServerError.url}`
    }
  ];
}
