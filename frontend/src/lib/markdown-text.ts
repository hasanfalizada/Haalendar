// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Markdown rules shared by the renderer and previews
// (FR-X-20, D-51): CommonMark + GFM (autolinks, strikethrough, tables, read-only task boxes), a single line break is a
// break (legacy plain text keeps its lines). Safety: raw HTML is never interpreted — remarkHtmlAsText turns it into
// the text it is (links: lib/markdown.ts safeUrl). toPlainText gives the text of a Markdown source for one-line
// previews (lists, popovers) and later the search index. Loaded with the renderer chunk, not the main bundle.
import type { Html, Nodes, Paragraph, Root, Text } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const BLOCK_PARENTS = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

/** remark plugin: raw HTML becomes literal text (inline) or a paragraph of literal text (block). */
export function remarkHtmlAsText() {
  return (tree: Root) => {
    visit(tree, "html", (node: Html, index, parent) => {
      if (!parent || index === undefined) return;
      const text: Text = { type: "text", value: node.value };
      const replacement: Text | Paragraph = BLOCK_PARENTS.has(parent.type)
        ? { type: "paragraph", children: [text] }
        : text;
      (parent.children as Nodes[])[index] = replacement;
    });
  };
}

const LINE_BLOCKS = new Set(["root", "blockquote", "list", "listItem", "table", "footnoteDefinition"]);

function textOf(node: Nodes): string {
  if (node.type === "break") return "\n";
  if (node.type === "image" || node.type === "imageReference") return node.alt ?? "";
  if ("value" in node) return node.value;
  if (!("children" in node)) return "";
  const parts = (node.children as Nodes[]).map(textOf);
  if (node.type === "tableRow") return parts.join(" ");
  return parts.join(LINE_BLOCKS.has(node.type) ? "\n" : "");
}

const parser = unified().use(remarkParse).use(remarkGfm);

/** Plain text of a Markdown source; `maxLength` shortens it on a word boundary with "…". */
export function toPlainText(source: string, options: { singleLine?: boolean; maxLength?: number } = {}): string {
  let text = textOf(parser.parse(source))
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (options.singleLine) text = text.replace(/\s+/g, " ");
  const max = options.maxLength;
  if (max !== undefined && text.length > max) {
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(" ");
    text = `${(space >= max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
  }
  return text;
}
