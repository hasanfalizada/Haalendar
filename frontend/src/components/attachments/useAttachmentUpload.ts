// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Upload images to an item (picker, drop, paste): local checks, one
// runWrite per file with Undo, a preview tile while the upload runs. Editors put `onPaste` on their text fields so a
// pasted screenshot is attached while pasted text stays text.
import { useQueryClient } from "@tanstack/react-query";
import { type ClipboardEvent, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { attachmentKeys, uploadAttachmentFile } from "@/api/attachments";
import { runWrite } from "@/api/write";
import { checkImage, imageFiles } from "@/lib/images";
import { log } from "@/lib/log";
import { notify } from "@/lib/notify";
import { newStep } from "@/lib/undo";
import { uuidv7 } from "@/lib/uuid";

export const MAX_ATTACHMENTS = 20;

export interface Pending {
  id: string;
  name: string;
  preview: string;
}

/** Upload images to an item; returns the pending uploads and handlers for paste and drop. */
export function useAttachmentUpload(itemId: string, count: number) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Pending[]>([]);

  useEffect(
    () => () => {
      pending.forEach((p) => {
        URL.revokeObjectURL(p.preview);
      });
    },
    // Object URLs are released when the tiles go away (unmount); each finished upload releases its own below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const upload = useCallback(
    async (files: File[]) => {
      let room = MAX_ATTACHMENTS - count - pending.length;
      for (const file of files) {
        if (room <= 0) {
          notify.failure(t("attachments.limit", { max: MAX_ATTACHMENTS }));
          break;
        }
        const problem = await checkImage(file);
        if (problem) {
          log.info("attachment_rejected_locally", { problem });
          notify.failure(problem === "size" ? t("attachments.tooLarge") : t("attachments.badType"));
          continue;
        }
        room -= 1;
        const entry: Pending = {
          id: uuidv7(),
          name: file.name || t("attachments.pasted"),
          preview: URL.createObjectURL(file),
        };
        setPending((current) => [...current, entry]);
        void runWrite({
          name: "attachment_upload",
          run: () => uploadAttachmentFile(itemId, file, entry.id),
          success: t("attachments.added", { name: entry.name }),
          reasons: (p) =>
            p.code === "payload_too_large"
              ? t("attachments.tooLarge")
              : p.code === "unsupported_media_type"
                ? t("attachments.badType")
                : p.code === "invalid_state"
                  ? t("attachments.limit", { max: MAX_ATTACHMENTS })
                  : null,
          undo: (data) =>
            newStep(
              "attachment.create",
              { key: "undo.labels.attachmentAdded", values: { name: data.file_name } },
              {
                id: data.id,
              },
            ),
        }).finally(() => {
          URL.revokeObjectURL(entry.preview);
          setPending((current) => current.filter((p) => p.id !== entry.id));
          void queryClient.invalidateQueries({ queryKey: attachmentKeys.item(itemId) });
        });
      }
    },
    [count, pending.length, itemId, queryClient, t],
  );

  /** For text fields and the attachment area: a pasted image is attached, pasted text stays text. */
  const onPaste = useCallback(
    (event: ClipboardEvent) => {
      const files = imageFiles(event.clipboardData.items);
      if (files.length === 0) return;
      event.preventDefault();
      void upload(files);
    },
    [upload],
  );

  return { pending, upload, onPaste };
}
