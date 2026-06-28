import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";

const HOSTILE_PAYLOAD = '<script>alert("possum")</script>';

interface BrowserArtifact {
  absolutePath: string;
  relativePath: string;
}

export interface HostileServerError {
  url: string;
  method: string;
  status: number;
}

export interface HostileProbeResult {
  targetUrl: string;
  finalUrl?: string;
  payload: string;
  serverErrors: HostileServerError[];
  trace?: string;
  steps: Array<Record<string, unknown>>;
}

export interface ProbeHostileInput {
  targetUrl: string;
  trace?: BrowserArtifact;
  storageState?: string;
}

export async function probeHostileValidation(input: ProbeHostileInput): Promise<HostileProbeResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    ...(input.storageState ? { storageState: input.storageState } : {})
  });
  const serverErrors: HostileServerError[] = [];
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
        inputs: Array.from(firstForm.querySelectorAll("input,textarea,select"))
          .map((element) => element.getAttribute("name") ?? "")
          .filter(Boolean),
        hasSubmitControl: Boolean(submitControl)
      };
    });

    if (!form || !form.hasSubmitControl) {
      const result = { targetUrl: input.targetUrl, finalUrl, payload: HOSTILE_PAYLOAD, serverErrors, steps };
      await writeTrace(input, result);
      return result;
    }

    steps.push({ action: "observe_form", form });

    page.on("response", (seenResponse) => {
      const method = seenResponse.request().method().toUpperCase();
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        return;
      }

      if (seenResponse.status() >= 500) {
        serverErrors.push({ url: seenResponse.url(), method, status: seenResponse.status() });
      }
    });

    await page.evaluate((payload) => {
      const firstForm = document.querySelector("form");
      if (!firstForm) {
        throw new Error("Could not find form");
      }

      for (const field of Array.from(
        firstForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input,textarea,select"
        )
      )) {
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

        field.value = payload;
      }

      const submitControl = firstForm.querySelector<HTMLElement>(
        'button:not([type]),button[type="submit"],input[type="submit"]'
      );
      if (!submitControl) {
        throw new Error("Could not find submit control");
      }

      submitControl.dataset.possumHostileSubmit = "true";
    }, HOSTILE_PAYLOAD);

    await page.locator('[data-possum-hostile-submit="true"]').click({ timeout: 2000 });
    await waitForCondition(() => serverErrors.length > 0, 1500);

    steps.push({
      action: "submit_hostile_payload",
      payload: HOSTILE_PAYLOAD,
      serverErrors
    });

    const result = {
      targetUrl: input.targetUrl,
      finalUrl,
      payload: HOSTILE_PAYLOAD,
      serverErrors,
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

async function writeTrace(input: ProbeHostileInput, result: HostileProbeResult): Promise<void> {
  if (!input.trace) {
    return;
  }

  await mkdir(dirname(input.trace.absolutePath), { recursive: true });
  await writeFile(
    input.trace.absolutePath,
    `${JSON.stringify(
      {
        persona: "hostile",
        mission: "Submit unexpected input and watch for error-page failures.",
        targetUrl: input.targetUrl,
        steps: result.steps
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}
