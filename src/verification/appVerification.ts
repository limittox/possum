import { AuditInput, AuditResult, runAudit } from "../audit/audit.js";

export type VerifyAppInput = Omit<AuditInput, "runType">;

export async function verifyApp(input: VerifyAppInput): Promise<AuditResult> {
  return runAudit({ ...input, runType: "app_verification" });
}
