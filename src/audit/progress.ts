export type AuditPhase = "beginner" | "impatient" | "hostile" | "claims";

export type ClaimProgressVerdict = "fulfilled" | "unfulfilled" | "inconclusive";
export type FeatureProgressVerdict = "passed" | "failed" | "inconclusive";
export type FeatureSetupProgressStatus = "skipped" | "passed" | "inconclusive";

export type AuditProgressEvent =
  | { type: "app-starting"; command: string }
  | { type: "app-ready" }
  | { type: "phase-start"; phase: AuditPhase; index: number; total: number }
  | { type: "phase-done"; phase: AuditPhase; index: number; total: number; findings: number }
  | { type: "judge-done"; accepted: number; candidates: number }
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
  | { type: "claims-truncated"; processed: number; total: number }
  | { type: "feature-setup-start"; steps: number }
  | { type: "feature-setup-done"; status: FeatureSetupProgressStatus }
  | { type: "feature-check-start"; index: number; total: number; check: string }
  | { type: "feature-check-step"; index: number; total: number; step: number; maxSteps: number }
  | { type: "feature-check-done"; index: number; total: number; verdict: FeatureProgressVerdict };

export type AuditProgressReporter = (event: AuditProgressEvent) => void;
