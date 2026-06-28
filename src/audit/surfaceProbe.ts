import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type Page } from "playwright";
import { PageSurface, PageSurfaceSchema } from "../contracts/surface.js";
import { extractClaimsFromReadme, extractHomepageClaims } from "./claimExtractor.js";

const BEGINNER_MISSION = "Find an obvious next step from first customer-facing screen.";

interface BrowserArtifact {
  absolutePath: string;
  relativePath: string;
}

export interface ProbeTargetSurfaceInput {
  rootDir?: string;
  targetUrl: string;
  screenshot?: BrowserArtifact;
  trace?: BrowserArtifact;
  storageState?: string;
}

export async function probeTargetSurface(input: ProbeTargetSurfaceInput): Promise<PageSurface> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    ...(input.storageState ? { storageState: input.storageState } : {})
  });

  try {
    const response = await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });

    if (!response) {
      throw new Error("Target did not return a response");
    }

    if (!response.ok()) {
      throw new Error(`Target returned HTTP ${response.status()}`);
    }

    let screenshotRelativePath: string | undefined;
    if (input.screenshot) {
      await mkdir(dirname(input.screenshot.absolutePath), { recursive: true });
      try {
        await page.screenshot({ path: input.screenshot.absolutePath, fullPage: true });
        screenshotRelativePath = input.screenshot.relativePath;
      } catch {
        screenshotRelativePath = undefined;
      }
    }

    const surface = await page.evaluate(() => {
      const text = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

    return {
      title: document.title.trim(),
      metaDescription: text(document.querySelector('meta[name="description"]')?.getAttribute("content")),
      headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
        .map((element) => text(element.textContent))
        .filter(Boolean),
      paragraphs: Array.from(document.querySelectorAll("p"))
        .map((element) => text(element.textContent))
        .filter(Boolean),
      links: Array.from(document.querySelectorAll("a"))
          .map((element) => ({
            text: text(element.textContent),
            href: element.getAttribute("href") ?? ""
          }))
          .filter((link) => link.text.length > 0 || link.href.length > 0),
        buttons: Array.from(document.querySelectorAll("button"))
          .map((element) => text(element.textContent))
          .filter(Boolean),
        forms: Array.from(document.querySelectorAll("form")).map((form) => ({
          action: form.getAttribute("action") || undefined,
          method: (form.getAttribute("method") || "get").toLowerCase(),
          inputs: Array.from(form.querySelectorAll("input,textarea,select"))
            .map((element) => element.getAttribute("name") ?? "")
            .filter(Boolean)
        }))
      };
    });

  const claims = [
    ...extractHomepageClaims({
      headings: surface.headings,
      metaDescription: surface.metaDescription,
      paragraphs: surface.paragraphs,
      title: surface.title
    }),
    ...(input.rootDir ? await extractClaimsFromReadme(input.rootDir) : [])
  ];

  const parsedSurface = PageSurfaceSchema.parse({
    targetUrl: input.targetUrl,
    finalUrl: page.url(),
    status: response.status(),
    ...surface,
    claims,
    screenshot: screenshotRelativePath
  });

    if (input.trace) {
      await writeBeginnerTrace({
        page,
        targetUrl: input.targetUrl,
        surface: parsedSurface,
        trace: input.trace
      });
    }

    return parsedSurface;
  } finally {
    await browser.close();
  }
}

async function writeBeginnerTrace(input: {
  page: Page;
  targetUrl: string;
  surface: PageSurface;
  trace: BrowserArtifact;
}): Promise<void> {
  const steps: Array<Record<string, unknown>> = [
    {
      action: "navigate",
      url: input.targetUrl,
      finalUrl: input.surface.finalUrl,
      status: input.surface.status,
      title: input.surface.title
    },
    {
      action: "observe_actions",
      links: input.surface.links.length,
      buttons: input.surface.buttons.length,
      forms: input.surface.forms.length
    }
  ];

  const firstLink = input.surface.links.find((link) => link.href.length > 0);
  if (firstLink) {
    steps.push({
      action: "click_link",
      text: firstLink.text,
      href: firstLink.href
    });

    try {
      await input.page.evaluate((href) => {
        const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
          (element) => element.getAttribute("href") === href
        );

        if (!link) {
          throw new Error(`Could not find link with href ${href}`);
        }

        link.dataset.possumTraceLink = "true";
      }, firstLink.href);

      const expectedUrl = new URL(firstLink.href, input.surface.finalUrl).toString();
      await Promise.all([
        input.page.waitForURL(expectedUrl, { timeout: 2000 }).catch(() => undefined),
        input.page.locator('[data-possum-trace-link="true"]').click({ timeout: 2000 })
      ]);

      steps.push({
        action: "after_click",
        finalUrl: input.page.url(),
        title: await input.page.title()
      });
    } catch (error) {
      steps.push({
        action: "click_link_error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await mkdir(dirname(input.trace.absolutePath), { recursive: true });
  await writeFile(
    input.trace.absolutePath,
    `${JSON.stringify(
      {
        persona: "beginner",
        mission: BEGINNER_MISSION,
        targetUrl: input.targetUrl,
        steps
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
