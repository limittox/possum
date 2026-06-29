import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateKeyboardControls,
  KeyboardControl,
  probeKeyboardAccess
} from "../src/audit/keyboardProbe.js";

function newPageWithHtml(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function control(overrides: Partial<KeyboardControl>): KeyboardControl {
  return {
    index: 0,
    tagName: "button",
    selector: "button",
    text: "",
    role: undefined,
    type: undefined,
    href: undefined,
    ariaLabel: undefined,
    title: undefined,
    placeholder: undefined,
    name: "",
    disabled: false,
    visible: true,
    native: true,
    customInteractive: false,
    focusable: true,
    ...overrides
  };
}

describe("keyboard probe", () => {
  it("recognizes accessible names from common label sources", () => {
    const controls: KeyboardControl[] = [
      control({ index: 0, selector: "#text", text: "Save", name: "Save" }),
      control({ index: 1, selector: "#aria", ariaLabel: "Close", name: "Close" }),
      control({ index: 2, selector: "#label", tagName: "input", name: "Email" }),
      control({ index: 3, selector: "#placeholder", tagName: "input", placeholder: "Search", name: "Search" }),
      control({ index: 4, selector: "#title", title: "More options", name: "More options" }),
      control({ index: 5, selector: "#image", tagName: "a", name: "Home" }),
      control({ index: 6, selector: "#value", tagName: "input", type: "submit", name: "Send" })
    ];

    expect(
      evaluateKeyboardControls(
        controls,
        controls.map((item) => ({
          index: item.index,
          selector: item.selector,
          tagName: item.tagName,
          role: item.role,
          type: item.type,
          href: item.href,
          name: item.name
        }))
      )
    ).toEqual([]);
  });

  it("reports missing names for visible enabled controls", () => {
    const issues = evaluateKeyboardControls([control({ selector: "button.icon", name: "" })], [
      { index: 0, selector: "button.icon", tagName: "button", name: "" }
    ]);

    expect(issues).toContainEqual({
      kind: "missing_name",
      controls: [expect.objectContaining({ selector: "button.icon" })]
    });
  });

  it("reports non-focusable custom controls", () => {
    const issues = evaluateKeyboardControls([
      control({
        selector: "div[role=button]",
        tagName: "div",
        role: "button",
        native: false,
        customInteractive: true,
        focusable: false,
        name: "Open"
      })
    ], []);

    expect(issues).toContainEqual({
      kind: "non_focusable_control",
      controls: [expect.objectContaining({ selector: "div[role=button]" })]
    });
  });

  it("reports no tabbable control when controls exist but tab reaches none", () => {
    const issues = evaluateKeyboardControls([control({ selector: "button", name: "Save" })], []);

    expect(issues).toContainEqual({
      kind: "no_tabbable_control",
      controls: [expect.objectContaining({ selector: "button" })]
    });
  });

  it("does not report issues for pages without controls", () => {
    expect(evaluateKeyboardControls([], [])).toEqual([]);
  });

  it("tabs to normal links and buttons", async () => {
    const targetUrl = newPageWithHtml(`
      <a href="#start">Start</a>
      <button>Continue</button>
    `);
    const root = await mkdtemp(join(tmpdir(), "possum-keyboard-probe-"));

    const result = await probeKeyboardAccess({
      targetUrl,
      trace: {
        absolutePath: join(root, "keyboard-trace.json"),
        relativePath: "keyboard-trace.json"
      }
    });

    expect(result.controls.map((item) => item.name)).toEqual(["Start", "Continue"]);
    expect(result.tabStops.length).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
    await expect(readFile(join(root, "keyboard-trace.json"), "utf8")).resolves.toContain("tabStops");
  });

  it("reports unnamed icon button from browser probe", async () => {
    const targetUrl = newPageWithHtml(`<button><svg aria-hidden="true"></svg></button>`);

    const result = await probeKeyboardAccess({ targetUrl });

    expect(result.issues).toContainEqual({
      kind: "missing_name",
      controls: [expect.objectContaining({ tagName: "button" })]
    });
  });

  it("reports custom role button without tabindex from browser probe", async () => {
    const targetUrl = newPageWithHtml(`<div role="button" onclick="window.clicked = true">Open menu</div>`);

    const result = await probeKeyboardAccess({ targetUrl });

    expect(result.issues).toContainEqual({
      kind: "non_focusable_control",
      controls: [expect.objectContaining({ role: "button", focusable: false })]
    });
  });
});
