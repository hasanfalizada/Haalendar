// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Markdown (FR-X-20, D-51): CommonMark + GFM rendering, sanitising
// against a set of XSS payloads (no markup, script, handler or dangerous URL may come out of a source), links and
// images, plain text for previews, the editor (tabs, Ctrl/Cmd+B/I, help) and the lazy wrapper.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import "@/i18n";
import { safeUrl, toggleMark } from "@/lib/markdown";
import { toPlainText } from "@/lib/markdown-text";

import { Markdown } from "./Markdown";
import { MarkdownEditor } from "./MarkdownEditor";
import MarkdownView from "./MarkdownView";

function view(source: string): HTMLElement {
  const { container } = render(<MarkdownView source={source} />);
  return container.querySelector(".markdown") as HTMLElement;
}

describe("Markdown rendering", () => {
  it("renders CommonMark and the GFM extensions", () => {
    const root = view(
      [
        "# Title",
        "**bold** _italic_ ~~gone~~ `code`",
        "",
        "- one",
        "- two",
        "",
        "1. first",
        "",
        "> quote",
        "",
        "| A | B |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "- [x] done",
        "",
        "```",
        "block",
        "```",
      ].join("\n"),
    );
    expect(root.querySelector("h4")).toHaveTextContent("Title"); // shifted below the page's headings
    expect(root.querySelector("h1, h2, h3")).toBeNull();
    expect(root.querySelector("strong")).toHaveTextContent("bold");
    expect(root.querySelector("em")).toHaveTextContent("italic");
    expect(root.querySelector("del")).toHaveTextContent("gone");
    expect(root.querySelector("p code")).toHaveTextContent("code");
    expect(root.querySelectorAll("ul li")).toHaveLength(3);
    expect(root.querySelector("ol li")).toHaveTextContent("first");
    expect(root.querySelector("blockquote")).toHaveTextContent("quote");
    expect(root.querySelector("table td")).toHaveTextContent("1");
    expect(root.querySelector("pre code")).toHaveTextContent("block");
    const box = root.querySelector('input[type="checkbox"]');
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
  });

  it("keeps single line breaks (legacy plain text keeps its lines)", () => {
    const root = view("first line\nsecond line");
    expect(root.querySelector("p br")).not.toBeNull();
  });

  it("opens web, e-mail and phone links in a new tab without access to the page", () => {
    const root = view(
      "[site](https://example.org/a?b=1) <https://auto.example> www.example.com [mail](mailto:a@b.c) [call](tel:+123)",
    );
    const links = [...root.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.org/a?b=1",
      "https://auto.example/",
      "http://www.example.com/",
      "mailto:a@b.c",
      "tel:+123",
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    }
  });

  it("shows other links as text and never loads remote pictures", () => {
    const root = view("[relative](/calendar) ![photo](https://tracker.example/p.png) ![local](attachment.png)");
    expect(root.querySelector("img")).toBeNull();
    const links = [...root.querySelectorAll("a")];
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent("photo");
    expect(links[0]).toHaveAttribute("href", "https://tracker.example/p.png");
    expect(root).toHaveTextContent("relative");
    expect(root).toHaveTextContent("local");
  });
});

const PAYLOADS = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
  '<iframe src="https://evil.example"></iframe>',
  "<svg onload=alert(1)><circle/></svg>",
  '<div style="background:url(javascript:alert(1))">styled</div>',
  "<details open ontoggle=alert(1)>x</details>",
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  "[click](javascript:alert(1))",
  "[click](JaVaScRiPt:alert(1))",
  "[click]( javascript:alert(1) )",
  "[click](&#106;avascript:alert(1))",
  "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
  "[click](vbscript:msgbox(1))",
  "[click](file:///etc/passwd)",
  "<javascript:alert(1)>",
  "[ref][r]\n\n[r]: javascript:alert(1)",
  "![x](javascript:alert(1))",
  '![x](x "onerror=alert(1)")',
  "**<b onmouseover=alert(1)>bold</b>**",
  "`<script>alert(1)</script>`",
];

describe("Markdown sanitising", () => {
  it.each(PAYLOADS)("renders %j harmlessly", (payload) => {
    const root = view(payload);
    expect(
      root.querySelector("script, iframe, object, embed, svg, math, img, style, form, details, b[onmouseover]"),
    ).toBeNull();
    for (const element of root.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        expect(attribute.name.startsWith("on"), `${element.tagName} ${attribute.name}`).toBe(false);
        expect(attribute.name).not.toBe("style");
      }
    }
    for (const link of root.querySelectorAll("a")) {
      expect(link.getAttribute("href")).toMatch(/^(https?:|mailto:|tel:)/);
    }
  });

  it("shows raw HTML as the text it is", () => {
    const root = view("Hello <b>world</b>\n\n<div>block</div>");
    expect(root.querySelector("b, div div")).toBeNull();
    expect(root).toHaveTextContent("Hello <b>world</b>");
    expect(root).toHaveTextContent("<div>block</div>");
  });

  it("accepts only web, e-mail and phone URLs", () => {
    expect(safeUrl("https://example.org")).toBe("https://example.org/");
    expect(safeUrl(" mailto:a@b.c ")).toBe("mailto:a@b.c");
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,x",
      "/relative",
      "#top",
      "",
      null,
      undefined,
      "ftp://x",
    ]) {
      expect(safeUrl(bad)).toBeNull();
    }
  });
});

describe("plain text", () => {
  it("strips the syntax and keeps the words", () => {
    expect(toPlainText("# Plan\n\n**Leg** day with _Ana_ — see [notes](https://x.example)")).toBe(
      "Plan\nLeg day with Ana — see notes",
    );
    expect(toPlainText("- milk\n- bread", { singleLine: true })).toBe("milk bread");
    expect(toPlainText("<b>raw</b> & `code`")).toBe("<b>raw</b> & code");
    expect(toPlainText("![alt text](https://x.example/p.png)")).toBe("alt text");
  });

  it("shortens on a word boundary", () => {
    expect(toPlainText("one two three four five", { maxLength: 12 })).toBe("one two…");
    expect(toPlainText("short", { maxLength: 12 })).toBe("short");
  });
});

describe("editor", () => {
  it("wraps and unwraps the selection", () => {
    expect(toggleMark("say hi", 4, 6, "**")).toEqual({ value: "say **hi**", start: 6, end: 8 });
    expect(toggleMark("say **hi**", 6, 8, "**")).toEqual({ value: "say hi", start: 4, end: 6 });
    expect(toggleMark("", 0, 0, "_")).toEqual({ value: "__", start: 1, end: 1 });
  });

  function Harness({ initial = "" }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return <MarkdownEditor id="desc" label="Description" value={value} onChange={setValue} />;
  }

  it("previews, formats with Ctrl+B / Ctrl+I and offers the formatting help", async () => {
    const user = userEvent.setup();
    render(<Harness initial="see me" />);
    const area = screen.getByLabelText("Description");
    expect(area).toHaveAccessibleDescription(/Markdown supported/);
    area.focus();
    (area as HTMLTextAreaElement).setSelectionRange(4, 6);
    await user.keyboard("{Control>}b{/Control}");
    expect(area).toHaveValue("see **me**");
    await user.keyboard("{Control>}i{/Control}");
    expect(area).toHaveValue("see **_me_**");

    await user.click(screen.getByRole("tab", { name: "Preview" }));
    const panel = screen.getByRole("tabpanel", { name: "Preview" });
    expect(await within(panel).findByText("me")).toBeInTheDocument();
    expect(panel.querySelector("strong em")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Write" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Formatting help" }));
    const help = await screen.findByRole("dialog", { name: "Text formatting" });
    expect(within(help).getByText("~~struck through~~")).toBeInTheDocument();
    expect(within(help).getByLabelText("Try it here (nothing is saved)")).toBeInTheDocument();
  });

  it("says when there is nothing to preview", async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument();
  });
});

describe("lazy wrapper", () => {
  it("shows the source as text until the renderer has loaded", async () => {
    render(<Markdown source={"**loaded**"} />);
    expect(await screen.findByText("loaded", { selector: "strong" })).toBeInTheDocument();
  });
});
