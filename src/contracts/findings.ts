import { z } from "zod";
import { PersonaSchema } from "./config.js";

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const ConfidenceSchema = z.enum(["candidate", "confirmed"]);
export const RunTypeSchema = z.enum(["audit", "app_verification", "feature_verification"]);

export const FindingSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  persona: PersonaSchema,
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  mission: z.string().min(1),
  claim: z.string().min(1).optional(),
  expected: z.string().min(1),
  actual: z.string().min(1),
  reproducibility: z.object({
    status: z.enum(["not_replayed", "reproduced", "not_reproduced"]),
    attempts: z.number().int().nonnegative()
  }),
  evidence: z.object({
    screenshots: z.array(z.string()),
    trace: z.string().min(1),
    repro: z.string().min(1)
  }),
  dedupeFingerprint: z.string().min(1)
});

export const RunDiagnosticSchema = z.object({
  phase: z.enum(["claims"]),
  status: z.enum(["inconclusive"]),
  reason: z.string().min(1)
});

export const RunReportSchema = z.object({
  runType: RunTypeSchema.default("audit"),
  runId: z.string().min(1),
  targetUrl: z.string().url(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  personas: z.array(PersonaSchema),
  findings: z.array(FindingSchema),
  diagnostics: z.array(RunDiagnosticSchema).optional()
});

export type Severity = z.infer<typeof SeveritySchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type RunType = z.infer<typeof RunTypeSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type RunDiagnostic = z.infer<typeof RunDiagnosticSchema>;
export type RunReport = z.infer<typeof RunReportSchema>;
export type RunReportInput = z.input<typeof RunReportSchema>;
