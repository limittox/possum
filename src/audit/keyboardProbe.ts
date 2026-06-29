import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, Page } from "playwright";

interface BrowserArtifact {
  absolutePath: string;
  relativePath: string;
}

export interface KeyboardControl {
  index: number;
  tagName: string;
  selector?: string;
  text: string;
  role?: string;
  type?: string;
  href?: string;
  ariaLabel?: string;
  title?: string;
  placeholder?: string;
  name: string;
  disabled: boolean;
  visible: boolean;
  native: boolean;
  customInteractive: boolean;
  focusable: boolean;
}

export interface KeyboardTabStop {
  index: number;
  selector?: string;
  tagName: string;
  role?: string;
  type?: string;
  href?: string;
  name: string;
}

export type KeyboardProbeIssueKind = "missing_name" | "non_focusable_control" | "no_tabbable_control";

export interface KeyboardProbeIssue {
  kind: KeyboardProbeIssueKind;
  controls: KeyboardControl[];
}

export interface KeyboardProbeResult {
  targetUrl: string;
  finalUrl?: string;
  controls: KeyboardControl[];
  tabStops: KeyboardTabStop[];
  issues: KeyboardProbeIssue[];
  trace?: string;
  steps: Array<Record<string, unknown>>;
}

export interface ProbeKeyboardAccessInput {
  targetUrl: string;
  trace?: BrowserArtifact;
  storageState?: string;
}

export async function probeKeyboardAccess(input: ProbeKeyboardAccessInput): Promise<KeyboardProbeResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    ...(input.storageState ? { storageState: input.storageState } : {})
  });
  const steps: Array<Record<string, unknown>> = [];

  try {
    const response = await page.goto(input.targetUrl, { waitUntil: "domcontentloaded", timeout: 5000 });
    if (!response && !isResponseOptionalUrl(input.targetUrl)) {
      throw new Error("Target did not return a response");
    }
    if (response && !response.ok()) {
      throw new Error(`Target returned HTTP ${response.status()}`);
    }

    const finalUrl = page.url();
    steps.push({
      action: "navigate",
      url: input.targetUrl,
      finalUrl,
      status: response?.status(),
      title: await page.title()
    });

    const controls = await collectKeyboardControls(page);
    const maxTabPresses = Math.min(Math.max(controls.length * 2, 8), 40);
    const tabStops: KeyboardTabStop[] = [];
    const seenSelectors = new Set<string>();

    for (let index = 0; index < maxTabPresses; index += 1) {
      await page.keyboard.press("Tab");
      const tabStop = await collectActiveElementTabStop(page, index);
      if (!tabStop) {
        continue;
      }
      const key = tabStop.selector ?? `${tabStop.tagName}:${tabStop.name}:${index}`;
      if (seenSelectors.has(key)) {
        continue;
      }
      seenSelectors.add(key);
      tabStops.push(tabStop);
    }

    steps.push({ action: "tab", maxTabPresses, tabStops: tabStops.length });
    const issues = evaluateKeyboardControls(controls, tabStops);
    const result: KeyboardProbeResult = {
      targetUrl: input.targetUrl,
      finalUrl,
      controls,
      tabStops,
      issues,
      trace: input.trace?.relativePath,
      steps
    };
    await writeTrace(input, result);
    return result;
  } finally {
    await browser.close();
  }
}

export function evaluateKeyboardControls(
  controls: KeyboardControl[],
  tabStops: KeyboardTabStop[]
): KeyboardProbeIssue[] {
  const enabledVisibleControls = controls.filter((control) => control.visible && !control.disabled);
  if (enabledVisibleControls.length === 0) {
    return [];
  }

  const issues: KeyboardProbeIssue[] = [];
  const missingName = enabledVisibleControls.filter((control) => control.name.trim().length === 0);
  if (missingName.length > 0) {
    issues.push({ kind: "missing_name", controls: missingName });
  }

  const nonFocusableCustom = enabledVisibleControls.filter(
    (control) => control.customInteractive && !control.native && !control.focusable
  );
  if (nonFocusableCustom.length > 0) {
    issues.push({ kind: "non_focusable_control", controls: nonFocusableCustom });
  }

  const hasVisibleEnabledTabStop = tabStops.some((tabStop) =>
    enabledVisibleControls.some((control) => tabStop.selector !== undefined && control.selector === tabStop.selector)
  );
  if (!hasVisibleEnabledTabStop) {
    issues.push({ kind: "no_tabbable_control", controls: enabledVisibleControls });
  }

  return issues;
}

async function writeTrace(input: ProbeKeyboardAccessInput, result: KeyboardProbeResult): Promise<void> {
  if (!input.trace) {
    return;
  }
  await mkdir(dirname(input.trace.absolutePath), { recursive: true });
  await writeFile(input.trace.absolutePath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function isResponseOptionalUrl(url: string): boolean {
  return url.startsWith("data:") || url.startsWith("about:");
}

async function collectKeyboardControls(page: Page): Promise<KeyboardControl[]> {
  return page.evaluate((helperSource) => {
    const helpers = (0, eval)(`(${helperSource})`)();
    const selectors = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "textarea",
      "select",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='switch']",
      "[role='tab']",
      "[role='menuitem']",
      "[onclick]"
    ];

    return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(",")))
      .filter((element, index, all) => all.indexOf(element) === index)
      .map((element, index) => helpers.describeKeyboardControl(element, index))
      .filter((control) => control.visible);
  }, createKeyboardDomHelpers.toString());
}

async function collectActiveElementTabStop(page: Page, index: number): Promise<KeyboardTabStop | undefined> {
  return page.evaluate(
    ({ helperSource, tabIndex }) => {
      const helpers = (0, eval)(`(${helperSource})`)();
      const element = document.activeElement;
      if (!element || !(element instanceof HTMLElement) || element === document.body || element === document.documentElement) {
        return undefined;
      }
      if (!helpers.isVisible(element)) {
        return undefined;
      }
      const control = helpers.describeKeyboardControl(element, tabIndex);
      return {
        index: tabIndex,
        selector: control.selector,
        tagName: control.tagName,
        role: control.role,
        type: control.type,
        href: control.href,
        name: control.name
      };
    },
    { helperSource: createKeyboardDomHelpers.toString(), tabIndex: index }
  );
}

function createKeyboardDomHelpers() {
  function describeKeyboardControl(element: HTMLElement, index: number): KeyboardControl {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute("role") ?? undefined;
    const input = element instanceof HTMLInputElement ? element : undefined;
    const type = input?.type || element.getAttribute("type") || undefined;
    const disabled = isDisabled(element);
    const native = isNativeControl(element);
    const customInteractive = isCustomInteractive(element);

    return {
      index,
      tagName,
      selector: getStableSelector(element),
      text: compactText(element.innerText || element.textContent || ""),
      role,
      type,
      href: element instanceof HTMLAnchorElement ? element.href : undefined,
      ariaLabel: element.getAttribute("aria-label") ?? undefined,
      title: element.getAttribute("title") ?? undefined,
      placeholder: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder || undefined : undefined,
      name: computeAccessibleName(element),
      disabled,
      visible: isVisible(element),
      native,
      customInteractive,
      focusable: isFocusable(element)
    };
  }

  function computeAccessibleName(element: HTMLElement): string {
    const candidates = [
      element.getAttribute("aria-label"),
      getAriaLabelledByText(element),
      getAssociatedLabelText(element),
      getWrappingLabelText(element),
      element.innerText || element.textContent,
      getDescendantImageAltText(element),
      element.getAttribute("title"),
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : undefined,
      element instanceof HTMLInputElement && ["submit", "button", "reset"].includes(element.type) ? element.value : undefined
    ];

    return compactText(candidates.find((candidate) => compactText(candidate ?? "").length > 0) ?? "");
  }

  function getAriaLabelledByText(element: HTMLElement): string {
    const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    return compactText(ids.map((id) => document.getElementById(id)?.innerText ?? document.getElementById(id)?.textContent ?? "").join(" "));
  }

  function getAssociatedLabelText(element: HTMLElement): string {
    const id = element.getAttribute("id");
    if (!id) {
      return "";
    }
    return compactText(
      Array.from(document.querySelectorAll<HTMLLabelElement>(`label[for="${cssEscape(id)}"]`))
        .map((label) => label.innerText || label.textContent || "")
        .join(" ")
    );
  }

  function getWrappingLabelText(element: HTMLElement): string {
    const label = element.closest("label");
    return compactText(label?.innerText ?? label?.textContent ?? "");
  }

  function getDescendantImageAltText(element: HTMLElement): string {
    return compactText(
      Array.from(element.querySelectorAll<HTMLImageElement>("img[alt]"))
        .map((image) => image.alt)
        .join(" ")
    );
  }

  function isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element: HTMLElement): boolean {
    return (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true" ||
      (element instanceof HTMLButtonElement && element.disabled) ||
      (element instanceof HTMLInputElement && element.disabled) ||
      (element instanceof HTMLTextAreaElement && element.disabled) ||
      (element instanceof HTMLSelectElement && element.disabled)
    );
  }

  function isNativeControl(element: HTMLElement): boolean {
    return (
      element instanceof HTMLAnchorElement ||
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element.tagName.toLowerCase() === "summary"
    );
  }

  function isCustomInteractive(element: HTMLElement): boolean {
    return (
      ["button", "link", "checkbox", "radio", "switch", "tab", "menuitem"].includes(element.getAttribute("role") ?? "") ||
      element.hasAttribute("onclick")
    );
  }

  function isFocusable(element: HTMLElement): boolean {
    if (isDisabled(element)) {
      return false;
    }
    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null) {
      return Number.parseInt(tabindex, 10) >= 0;
    }
    if (element instanceof HTMLAnchorElement) {
      return element.hasAttribute("href");
    }
    return isNativeControl(element);
  }

  function getStableSelector(element: HTMLElement): string | undefined {
    if (element.id) {
      return `#${cssEscape(element.id)}`;
    }
    const testId = element.getAttribute("data-testid") || element.getAttribute("data-test") || element.getAttribute("data-cy");
    if (testId) {
      return `[data-testid="${cssEscape(testId)}"]`;
    }
    const tag = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    if (role) {
      return `${tag}[role="${cssEscape(role)}"]`;
    }
    const parent = element.parentElement;
    const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === element.tagName) : [];
    const index = siblings.indexOf(element) + 1;
    return siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
  }

  function cssEscape(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }

  function compactText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  return { describeKeyboardControl, isVisible };
}
