import { Finding } from "../contracts/findings.js";
import { PageSurface } from "../contracts/surface.js";

export interface BeginnerPersonaInput {
  runId: string;
  surface: PageSurface;
}

export function evaluateBeginnerPersona(input: BeginnerPersonaInput): Finding[] {
  const hasObviousAction =
    input.surface.links.length > 0 || input.surface.buttons.length > 0 || input.surface.forms.length > 0;

  if (hasObviousAction) {
    return [];
  }

  return [
    {
      id: "finding_beginner_dead_end_001",
      runId: input.runId,
      persona: "beginner",
      severity: "medium",
      confidence: "confirmed",
      mission: "Find an obvious next step from the first customer-facing screen.",
      claim: "The first screen should give a new customer an obvious path forward.",
      expected: "A beginner customer can identify a link, button, or form to continue.",
      actual: `The first screen${input.surface.title ? ` "${input.surface.title}"` : ""} has no links, buttons, or forms.`,
      reproducibility: { status: "reproduced", attempts: 1 },
      evidence: {
        screenshots: input.surface.screenshot ? [input.surface.screenshot] : [],
        trace: "findings/finding_beginner_dead_end_001/trace.json",
        repro: "findings/finding_beginner_dead_end_001/repro.spec.ts"
      },
      dedupeFingerprint: `beginner:dead-end:${input.surface.finalUrl}`
    }
  ];
}
