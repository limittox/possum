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
    case "claim-start":
      return `possum: claim ${event.index}/${event.total} — "${formatClaimLabel(event.claim)}"`;
    case "claim-step":
      return `possum: claim ${event.index}/${event.total} · attempt ${event.attempt}/${event.attempts} · step ${event.step}/${event.maxSteps}...`;
    case "claim-done":
      return `possum: claim ${event.index}/${event.total} — ${event.verdict}`;
    case "claims-truncated":
      return `possum: claims — budget reached, verified ${event.processed}/${event.total} claims`;
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

function formatClaimLabel(claim: string): string {
  const compact = claim.replace(/\s+/gu, " ").trim();
  if (compact.length <= 58) {
    return compact;
  }
  return `${compact.slice(0, 55)}...`;
}
