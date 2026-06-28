import { z } from "zod";

export const VerificationVerdictSchema = z.enum(["passed", "failed", "inconclusive"]);
export const VerificationCheckSourceSchema = z.enum(["explicit", "inferred"]);
export const FeatureSetupStatusSchema = z.enum(["skipped", "passed", "inconclusive"]);

export const FeatureCheckBriefSchema = z.object({
  text: z.string().trim().min(1),
  hints: z.record(z.unknown()).optional()
});

export const FeatureVerificationBriefSchema = z.object({
  feature: z.string().trim().min(1),
  pages: z.array(z.string().trim().min(1)).default([]),
  setup: z.array(z.string().trim().min(1)).default([]),
  checks: z.array(FeatureCheckBriefSchema).default([])
});

export const VerificationCheckSchema = z.object({
  id: z.string().min(1),
  source: VerificationCheckSourceSchema,
  text: z.string().min(1),
  pages: z.array(z.string().min(1)),
  hints: z.record(z.unknown()).optional()
});

export const VerificationActionRecordSchema = z.object({
  action: z.string().min(1),
  detail: z.string().min(1),
  url: z.string().optional(),
  evidence: z.record(z.unknown()).optional()
});

export const FeatureSetupResultSchema = z.object({
  status: FeatureSetupStatusSchema,
  reason: z.string().optional(),
  actions: z.array(VerificationActionRecordSchema)
});

export const FeatureCheckResultSchema = z.object({
  id: z.string().min(1),
  source: VerificationCheckSourceSchema,
  text: z.string().min(1),
  verdict: VerificationVerdictSchema,
  reason: z.string().min(1),
  actions: z.array(VerificationActionRecordSchema)
});

export const FeatureVerificationSummarySchema = z.object({
  runType: z.literal("feature_verification"),
  feature: z.string().min(1),
  targetUrl: z.string().url(),
  setup: FeatureSetupResultSchema,
  checks: z.array(FeatureCheckResultSchema)
});

export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;
export type VerificationCheckSource = z.infer<typeof VerificationCheckSourceSchema>;
export type FeatureSetupStatus = z.infer<typeof FeatureSetupStatusSchema>;
export type FeatureCheckBrief = z.infer<typeof FeatureCheckBriefSchema>;
export type FeatureVerificationBrief = z.infer<typeof FeatureVerificationBriefSchema>;
export type VerificationCheck = z.infer<typeof VerificationCheckSchema>;
export type VerificationActionRecord = z.infer<typeof VerificationActionRecordSchema>;
export type FeatureSetupResult = z.infer<typeof FeatureSetupResultSchema>;
export type FeatureCheckResult = z.infer<typeof FeatureCheckResultSchema>;
export type FeatureVerificationSummary = z.infer<typeof FeatureVerificationSummarySchema>;

const MAX_INFERRED_CHECKS = 3;

export function normalizeFeatureChecks(
  brief: FeatureVerificationBrief,
  inferredChecks: FeatureCheckBrief[] = []
): VerificationCheck[] {
  const explicit = brief.checks.map((check, index): VerificationCheck => ({
    id: `check_${index + 1}`,
    source: "explicit",
    text: check.text,
    pages: brief.pages,
    hints: check.hints
  }));

  const inferred = inferredChecks.slice(0, MAX_INFERRED_CHECKS).map((check, index): VerificationCheck => ({
    id: `check_${explicit.length + index + 1}`,
    source: "inferred",
    text: check.text,
    pages: brief.pages,
    hints: check.hints
  }));

  return [...explicit, ...inferred];
}
