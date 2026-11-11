// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Markdown renderer (FR-X-20, D-51), loaded on demand by <Markdown>.
// react-markdown builds React elements — no innerHTML anywhere — and raw HTML is turned into literal text first
// (remarkHtmlAsText), so a source can never add markup, scripts or event handlers. Links open in a new tab without
// access to this page; disallowed URLs and all images become plain text or a link (no remote images: tracking, CSP);
// headings are shifted below the page's own (h1 → h4) so the page outline stays intact.
import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { safeUrl } from "@/lib/markdown";
import { remarkHtmlAsText } from "@/lib/markdown-text";
import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkHtmlAsText, remarkGfm, remarkBreaks];

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

function heading(level: 4 | 5 | 6) {
  const Tag = `h${String(level)}` as "h4" | "h5" | "h6";
  return function Heading({ children }: { children?: ReactNode }) {
    return <Tag>{children}</Tag>;
  };
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const url = safeUrl(href);
    return url ? <ExternalLink href={url}>{children}</ExternalLink> : <span>{children}</span>;
  },
  img: ({ src, alt }) => {
    const url = typeof src === "string" ? safeUrl(src) : null;
    const label = alt || url || "";
    return url ? <ExternalLink href={url}>{label}</ExternalLink> : <span>{label}</span>;
  },
  input: (props: ComponentProps<"input">) => <input type="checkbox" checked={props.checked} disabled readOnly />,
  h1: heading(4),
  h2: heading(4),
  h3: heading(5),
  h4: heading(6),
  h5: heading(6),
  h6: heading(6),
};

/** Keeps every URL for the components above to judge (react-markdown's own filter would drop them silently). */
const keepUrl = (url: string) => url;

export default function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("markdown", className)}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS} urlTransform={keepUrl} skipHtml={false}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
