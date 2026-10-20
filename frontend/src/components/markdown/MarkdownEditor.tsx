// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-047. Markdown editor (design system: MarkdownEditor, FR-X-20, D-51): a
// plain text area with Write / Preview tabs, Ctrl/Cmd+B and Ctrl/Cmd+I wrap the selection in bold / italic (again
// removes it), the preview uses the same renderer as every view. "Formatting help" opens a cheat sheet with examples
// rendered by that renderer and a scratch area (FormattingHelpDialog, also offered in Help).
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toggleMark } from "@/lib/markdown";
import { cn } from "@/lib/utils";

import { Markdown } from "./Markdown";

type Tab = "write" | "preview";

const MARKS = { b: "**", i: "_" } as const;

interface MarkdownEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  error?: string | undefined;
  /** Show the "Formatting help" link (off inside the help itself). */
  helpLink?: boolean;
}

export function MarkdownEditor({
  id,
  label,
  value,
  onChange,
  rows = 6,
  maxLength,
  placeholder,
  error,
  helpLink = true,
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("write");
  const [helpOpen, setHelpOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Selection to restore once the new value is on screen (set synchronously, so fast key presses stay in order).
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    const selection = pendingSelection.current;
    if (!selection) return;
    pendingSelection.current = null;
    area.current?.setSelectionRange(selection.start, selection.end);
  }, [value]);
  const tabs = useId();
  const describedBy = [`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ");

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i") return;
    event.preventDefault();
    const target = event.currentTarget;
    const next = toggleMark(value, target.selectionStart, target.selectionEnd, MARKS[key]);
    pendingSelection.current = { start: next.start, end: next.end };
    onChange(next.value);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next: Tab = tab === "write" ? "preview" : "write";
    setTab(next);
    document.getElementById(`${tabs}-${next}`)?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </label>
        <div
          role="tablist"
          aria-label={t("markdown.mode", { label })}
          className="flex rounded-sm border border-line text-xs"
        >
          {(["write", "preview"] as const).map((name) => (
            <button
              key={name}
              id={`${tabs}-${name}`}
              type="button"
              role="tab"
              aria-selected={tab === name}
              aria-controls={`${tabs}-${name}-panel`}
              tabIndex={tab === name ? 0 : -1}
              onKeyDown={onTabKey}
              onClick={() => {
                setTab(name);
              }}
              className={cn(
                "h-8 px-2.5 md:h-7",
                tab === name ? "bg-primary-tint font-semibold text-primary" : "text-muted hover:bg-surface",
              )}
            >
              {t(`markdown.${name}`)}
            </button>
          ))}
        </div>
      </div>
      <div id={`${tabs}-write-panel`} role="tabpanel" aria-labelledby={`${tabs}-write`} hidden={tab !== "write"}>
        <textarea
          ref={area}
          id={id}
          rows={rows}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-describedby={describedBy}
          {...(error ? { "aria-invalid": true as const } : {})}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="w-full resize-y rounded-sm border border-line bg-bg px-2.5 py-2 text-[13px] text-fg placeholder:text-muted aria-invalid:border-danger"
        />
      </div>
      <div
        id={`${tabs}-preview-panel`}
        role="tabpanel"
        aria-labelledby={`${tabs}-preview`}
        hidden={tab !== "preview"}
        tabIndex={0}
        className="min-h-24 rounded-sm border border-line bg-surface px-2.5 py-2 text-[13px]"
      >
        {tab === "preview" ? (
          value.trim() ? (
            <Markdown source={value} />
          ) : (
            <p className="text-muted">{t("markdown.empty")}</p>
          )
        ) : null}
      </div>
      <div id={`${id}-hint`} className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
        <span>{t("markdown.supported")}</span>
        {helpLink ? (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => {
                setHelpOpen(true);
              }}
            >
              {t("markdown.help")}
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {helpLink ? <FormattingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} /> : null}
    </div>
  );
}

type ExampleKey =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "link"
  | "heading"
  | "list"
  | "numbered"
  | "task"
  | "quote"
  | "codeBlock"
  | "table"
  | "lineBreak";

const EXAMPLES: readonly { key: ExampleKey; source: string }[] = [
  { key: "bold", source: "**bold** or __bold__" },
  { key: "italic", source: "_italic_ or *italic*" },
  { key: "strike", source: "~~struck through~~" },
  { key: "code", source: "`inline code`" },
  { key: "link", source: "[Haalendar](https://github.com/hasanfalizada/Haalendar)" },
  { key: "heading", source: "# Heading" },
  { key: "list", source: "- milk\n- bread" },
  { key: "numbered", source: "1. first\n2. second" },
  { key: "task", source: "- [x] done\n- [ ] to do" },
  { key: "quote", source: "> quoted text" },
  { key: "codeBlock", source: "```\ncode block\n```" },
  { key: "table", source: "| Day | Room |\n|-----|------|\n| Mon | 101  |" },
  { key: "lineBreak", source: "first line\nsecond line" },
];

/** Cheat sheet with live examples and a scratch area (nothing is saved). */
export function FormattingHelpDialog({
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const { t } = useTranslation();
  const [scratch, setScratch] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("markdown.helpTitle")}
        description={t("markdown.helpIntro")}
        closeLabel={t("common.close")}
        className="md:max-w-2xl"
        {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}
      >
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="text-xs text-muted">
              <th className="py-1 pr-3 font-medium">{t("markdown.youType")}</th>
              <th className="py-1 font-medium">{t("markdown.youGet")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {EXAMPLES.map((example) => (
              <tr key={example.key} className="align-top">
                <td className="py-1.5 pr-3">
                  <span className="sr-only">{t(`markdown.examples.${example.key}`)}: </span>
                  <pre className="font-mono text-xs whitespace-pre-wrap">{example.source}</pre>
                </td>
                <td className="py-1.5">
                  <Markdown source={example.source} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">{t("markdown.safety")}</p>
        <MarkdownEditor
          id="markdown-scratch"
          label={t("markdown.tryIt")}
          value={scratch}
          onChange={setScratch}
          rows={4}
          helpLink={false}
        />
      </DialogContent>
    </Dialog>
  );
}
