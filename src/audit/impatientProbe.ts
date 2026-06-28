import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";

interface BrowserArtifact {
  absolutePath: string;
  relativePath: string;
}

interface FormTarget {
  action: string;
  method: string;
  inputs: string[];
  hasSubmitControl: boolean;
}

export interface DoubleSubmitProbeResult {
  targetUrl: string;
  finalUrl?: string;
  form?: FormTarget;
  submissionCount: number;
  submittedUrls: string[];
  trace?: string;
  steps: Array<Record<string, unknown>>;
}

export interface ProbeImpatientDoubleSubmitInput {
  targetUrl: string;
  trace?: BrowserArtifact;
}

export async function probeImpatientDoubleSubmit(
  input: ProbeImpatientDoubleSubmitInput
): Promise<DoubleSubmitProbeResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const submittedUrls: string[] = [];
  const steps: Array<Record<string, unknown>> = [];

  try {
    const response = await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
    if (!response) {
      throw new Error("Target did not return a response");
    }

    if (!response.ok()) {
      throw new Error(`Target returned HTTP ${response.status()}`);
    }

    const finalUrl = page.url();
    steps.push({
      action: "navigate",
      url: input.targetUrl,
      finalUrl,
      status: response.status(),
      title: await page.title()
    });

    const form = await page.evaluate(() => {
      const firstForm = document.querySelector("form");
      if (!firstForm) {
        return undefined;
      }

      const submitControl = firstForm.querySelector(
        'button:not([type]),button[type="submit"],input[type="submit"]'
      );

      return {
        action: firstForm.getAttribute("action") ?? "",
        method: (firstForm.getAttribute("method") ?? "get").toLowerCase(),
        inputs: Array.from(firstForm.querySelectorAll("input,textarea,select"))
          .map((element) => element.getAttribute("name") ?? "")
          .filter(Boolean),
        hasSubmitControl: Boolean(submitControl)
      };
    });

    if (!form) {
      const result = { targetUrl: input.targetUrl, finalUrl, submissionCount: 0, submittedUrls, steps };
      await writeTrace(input, result);
      return result;
    }

    const actionUrl = new URL(form.action || finalUrl, finalUrl).toString();
    const method = form.method.toUpperCase();
    steps.push({
      action: "observe_form",
      form: { ...form, action: actionUrl, method: form.method }
    });

    if (!form.hasSubmitControl) {
      const result = {
        targetUrl: input.targetUrl,
        finalUrl,
        form: { ...form, action: actionUrl },
        submissionCount: 0,
        submittedUrls,
        steps
      };
      await writeTrace(input, result);
      return result;
    }

    page.on("request", (request) => {
      const requestMethod = request.method().toUpperCase();
      const matchesNativeForm = requestMethod === method && normalizeUrl(request.url()) === normalizeUrl(actionUrl);
      const isMutationRequest = ["POST", "PUT", "PATCH", "DELETE"].includes(requestMethod);

      if (matchesNativeForm || isMutationRequest) {
        submittedUrls.push(request.url());
      }
    });

    await page.evaluate(() => {
      const firstForm = document.querySelector("form");
      if (!firstForm) {
        throw new Error("Could not find form");
      }

      for (const field of Array.from(firstForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input,textarea,select"))) {
        const tagName = field.tagName.toLowerCase();
        if (tagName === "select") {
          const select = field as HTMLSelectElement;
          if (select.options.length > 0) {
            select.selectedIndex = 0;
          }
          continue;
        }

        if (field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type)) {
          field.checked = true;
          continue;
        }

        field.value = field.getAttribute("type") === "email" || field.name.toLowerCase().includes("email")
          ? "possum@example.com"
          : "possum-test";
      }

      const submitControl = firstForm.querySelector<HTMLElement>(
        'button:not([type]),button[type="submit"],input[type="submit"]'
      );
      if (!submitControl) {
        throw new Error("Could not find submit control");
      }

      submitControl.dataset.possumImpatientSubmit = "true";
    });

    await page.locator('[data-possum-impatient-submit="true"]').dblclick({ timeout: 2000 });
    await waitForCondition(() => submittedUrls.length >= 2, 1500);

    steps.push({
      action: "double_submit",
      method,
      actionUrl,
      submissionCount: submittedUrls.length,
      submittedUrls
    });

    const result = {
      targetUrl: input.targetUrl,
      finalUrl,
      form: { ...form, action: actionUrl },
      submissionCount: submittedUrls.length,
      submittedUrls,
      trace: input.trace?.relativePath,
      steps
    };
    await writeTrace(input, result);
    return result;
  } finally {
    await browser.close();
  }
}

async function waitForCondition(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

async function writeTrace(input: ProbeImpatientDoubleSubmitInput, result: DoubleSubmitProbeResult): Promise<void> {
  if (!input.trace) {
    return;
  }

  await mkdir(dirname(input.trace.absolutePath), { recursive: true });
  await writeFile(
    input.trace.absolutePath,
    `${JSON.stringify(
      {
        persona: "impatient",
        mission: "Submit the first form twice like an impatient customer.",
        targetUrl: input.targetUrl,
        steps: result.steps
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
