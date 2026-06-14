import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ClaimSurface } from "../contracts/surface.js";

const MAX_CLAIMS = 20;
const MAX_CLAIM_LENGTH = 180;

export function normalizeClaimText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

export function extractClaimsFromMarkdown(markdown: string): ClaimSurface[] {
  const claims: ClaimSurface[] = [];
  let inCodeBlock = false;

  for (const rawLine of markdown.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock || line.length === 0) {
      continue;
    }

    const heading = line.match(/^#\s+(.+)$/u);
    if (heading) {
      addClaim(claims, "readme", stripMarkdown(heading[1]));
      continue;
    }

    if (!line.startsWith("#") && !line.startsWith("- ") && !line.startsWith("* ")) {
      addClaim(claims, "readme", stripMarkdown(line));
    }
  }

  return claims.slice(0, MAX_CLAIMS);
}

export async function extractClaimsFromReadme(rootDir: string): Promise<ClaimSurface[]> {
  try {
    const markdown = await readFile(join(rootDir, "README.md"), "utf8");
    return extractClaimsFromMarkdown(markdown);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

export function extractHomepageClaims(input: {
  headings: string[];
  metaDescription?: string;
  paragraphs: string[];
  title: string;
}): ClaimSurface[] {
  const claims: ClaimSurface[] = [];
  addClaim(claims, "homepage", input.title);
  addClaim(claims, "homepage", input.metaDescription ?? "");

  for (const heading of input.headings) {
    addClaim(claims, "homepage", heading);
  }

  for (const paragraph of input.paragraphs) {
    addClaim(claims, "homepage", paragraph);
  }

  return claims.slice(0, MAX_CLAIMS);
}

function addClaim(claims: ClaimSurface[], source: ClaimSurface["source"], text: string): void {
  const normalized = normalizeClaimText(text);
  if (normalized.length === 0 || normalized.length > MAX_CLAIM_LENGTH) {
    return;
  }

  if (claims.some((claim) => claim.source === source && claim.text === normalized)) {
    return;
  }

  claims.push({ source, text: normalized });
}

function stripMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/[*_~]/gu, "");
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
