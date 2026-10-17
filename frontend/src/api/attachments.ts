// +++===+++ 2026-10-17 — Hasan Alizada — HAAL-040. Attachment requests on the generated client. The image goes as the
// raw request body (contract: no multipart) with the original name percent-encoded in X-File-Name; a client-generated
// id makes a repeated upload return the first one.
import { queryOptions } from "@tanstack/react-query";

import { listAttachments, uploadAttachment } from "./generated/sdk.gen";
import type { Attachment } from "./generated/types.gen";
import { ApiError } from "./problem";

export const attachmentKeys = {
  all: ["attachments"] as const,
  item: (itemId: string) => ["attachments", itemId] as const,
};

export function attachmentsQuery(itemId: string) {
  return queryOptions({
    queryKey: attachmentKeys.item(itemId),
    queryFn: async (): Promise<Attachment[]> => {
      const { data, error } = await listAttachments({ path: { id: itemId } });
      if (error !== undefined) throw new ApiError(error);
      return data.data;
    },
  });
}

export function uploadAttachmentFile(itemId: string, file: File, id: string) {
  return uploadAttachment({
    path: { id: itemId },
    // The generated body type is a string (binary schema); the File is passed through untouched (no serializer).
    body: file as unknown as string,
    bodySerializer: null,
    headers: {
      "Content-Type": file.type,
      "X-File-Name": encodeURIComponent(file.name || "image"),
      "X-Attachment-Id": id,
    },
  });
}
