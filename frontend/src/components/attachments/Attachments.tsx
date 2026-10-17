// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Images on an item (FR-X-11): add by file picker, drag-and-drop or
// pasting a screenshot; a tile shows while the upload runs; thumbnails open a full preview (←/→ between images, Esc,
// download). Every upload and delete reports through runWrite and can be undone (uploads: useAttachmentUpload).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { attachmentKeys, attachmentsQuery } from "@/api/attachments";
import { deleteAttachment } from "@/api/generated/sdk.gen";
import type { Attachment } from "@/api/generated/types.gen";
import { runWrite } from "@/api/write";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { imageFiles } from "@/lib/images";
import { newStep } from "@/lib/undo";
import { cn } from "@/lib/utils";

import { MAX_ATTACHMENTS, useAttachmentUpload } from "./useAttachmentUpload";

function formatBytes(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit] ?? "B"}`;
}

interface AttachmentsProps {
  itemId: string;
  editable: boolean;
}

export function Attachments({ itemId, editable }: AttachmentsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: attachments = [] } = useQuery(attachmentsQuery(itemId));
  const { pending, upload, onPaste } = useAttachmentUpload(itemId, attachments.length);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const full = attachments.length + pending.length >= MAX_ATTACHMENTS;

  async function remove(attachment: Attachment) {
    await runWrite({
      name: "attachment_delete",
      run: () => deleteAttachment({ path: { id: attachment.id } }),
      success: t("attachments.deleted", { name: attachment.file_name }),
      undo: () =>
        newStep(
          "attachment.delete",
          { key: "undo.labels.attachmentDeleted", values: { name: attachment.file_name } },
          {
            id: attachment.id,
          },
        ),
    });
    await queryClient.invalidateQueries({ queryKey: attachmentKeys.item(itemId) });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!editable) return;
    const files = imageFiles(event.dataTransfer.files);
    if (files.length > 0) void upload(files);
  }

  return (
    <section
      aria-label={t("attachments.title")}
      className={cn(
        "flex flex-col gap-2 rounded-sm",
        dragging && "outline-2 outline-offset-2 outline-primary outline-dashed",
      )}
      onPaste={editable ? onPaste : undefined}
      onDragOver={(event) => {
        if (!editable) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium">
          {t("attachments.title")}{" "}
          <span className="text-muted">
            {attachments.length}/{MAX_ATTACHMENTS}
          </span>
        </h3>
        {editable ? (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
              aria-label={t("attachments.add")}
              onChange={(event) => {
                void upload(imageFiles(event.target.files));
                event.target.value = "";
              }}
            />
            <Button disabled={full} onClick={() => input.current?.click()}>
              <ImagePlus aria-hidden />
              {t("attachments.add")}
            </Button>
          </>
        ) : null}
      </div>
      {editable ? <p className="text-xs text-muted">{t("attachments.hint")}</p> : null}

      {attachments.length + pending.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
          {attachments.map((attachment, index) => (
            <li
              key={attachment.id}
              className="group relative aspect-square overflow-hidden rounded-sm border border-line"
            >
              <button
                type="button"
                className="size-full"
                aria-label={t("attachments.open", { name: attachment.file_name })}
                onClick={() => {
                  setPreviewIndex(index);
                }}
              >
                <img
                  src={attachment.thumbnail_url}
                  alt={attachment.file_name}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
              {editable ? (
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={t("attachments.delete", { name: attachment.file_name })}
                  className="absolute top-1 right-1 size-8 opacity-90 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                  onClick={() => void remove(attachment)}
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
          {pending.map((entry) => (
            <li
              key={entry.id}
              className="relative aspect-square overflow-hidden rounded-sm border border-line"
              aria-busy="true"
            >
              <img
                src={entry.preview}
                alt={t("attachments.uploading", { name: entry.name })}
                className="size-full object-cover opacity-50"
              />
              <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-primary" aria-hidden />
            </li>
          ))}
        </ul>
      ) : null}

      <AttachmentPreview attachments={attachments} index={previewIndex} onIndex={setPreviewIndex} />
    </section>
  );
}

function AttachmentPreview({
  attachments,
  index,
  onIndex,
}: {
  attachments: Attachment[];
  index: number | null;
  onIndex: (index: number | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const current = index !== null ? attachments[index] : undefined;
  const step = (by: number) => {
    if (index === null || attachments.length === 0) return;
    onIndex((index + by + attachments.length) % attachments.length);
  };
  return (
    <Dialog
      open={current !== undefined}
      onOpenChange={(open) => {
        if (!open) onIndex(null);
      }}
    >
      {current ? (
        <DialogContent
          title={current.file_name}
          description={`${current.width && current.height ? `${String(current.width)} × ${String(current.height)} · ` : ""}${formatBytes(current.size_bytes, i18n.language)}`}
          closeLabel={t("common.close")}
          className="md:max-w-3xl"
        >
          <div
            className="flex flex-col gap-3"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") step(1);
              else if (event.key === "ArrowLeft") step(-1);
            }}
          >
            <img src={current.url} alt={current.file_name} className="max-h-[70dvh] w-full rounded-sm object-contain" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("attachments.previous")}
                  disabled={attachments.length < 2}
                  onClick={() => {
                    step(-1);
                  }}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("attachments.next")}
                  disabled={attachments.length < 2}
                  onClick={() => {
                    step(1);
                  }}
                >
                  <ChevronRight aria-hidden />
                </Button>
                <span className="self-center text-xs text-muted">
                  {t("attachments.position", { index: (index ?? 0) + 1, total: attachments.length })}
                </span>
              </div>
              <Button asChild>
                <a href={current.url} download={current.file_name}>
                  <Download aria-hidden />
                  {t("attachments.download")}
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
