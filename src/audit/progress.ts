export type AuditPhase = "beginner" | "impatient" | "hostile" | "claims";

export type AuditProgressEvent =
  | { type: "app-starting"; command: string }
  | { type: "app-ready" }
  | { type: "phase-start"; phase: AuditPhase; index: number; total: number }
  | { type: "phase-done"; phase: AuditPhase; index: number; total: number; findings: number }
  | { type: "judge-done"; accepted: number; candidates: number };

export type AuditProgressReporter = (event: AuditProgressEvent) => void;
