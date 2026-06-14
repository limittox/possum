import { Finding, FindingSchema } from "../contracts/findings.js";

export interface RejectedFinding {
  finding: Finding;
  reason: string;
}

export interface JudgedFindings {
  accepted: Finding[];
  rejected: RejectedFinding[];
}

export function judgeFindings(findings: Finding[]): JudgedFindings {
  const accepted: Finding[] = [];
  const rejected: RejectedFinding[] = [];
  const seenFingerprints = new Set<string>();

  for (const finding of findings) {
    const parsed = FindingSchema.safeParse(finding);
    if (!parsed.success) {
      rejected.push({ finding, reason: "finding schema validation failed" });
      continue;
    }

    if (parsed.data.confidence !== "confirmed") {
      rejected.push({ finding, reason: `confidence is ${parsed.data.confidence}` });
      continue;
    }

    if (parsed.data.reproducibility.status !== "reproduced") {
      rejected.push({ finding, reason: `reproducibility status is ${parsed.data.reproducibility.status}` });
      continue;
    }

    if (parsed.data.reproducibility.attempts < 1) {
      rejected.push({ finding, reason: "reproducibility attempts must be at least 1" });
      continue;
    }

    if (seenFingerprints.has(parsed.data.dedupeFingerprint)) {
      rejected.push({ finding, reason: `duplicate dedupeFingerprint ${parsed.data.dedupeFingerprint}` });
      continue;
    }

    seenFingerprints.add(parsed.data.dedupeFingerprint);
    accepted.push(parsed.data);
  }

  return { accepted, rejected };
}
