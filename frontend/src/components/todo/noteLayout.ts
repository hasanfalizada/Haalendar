// +++===+++ 2026-11-18 15:40 +04 — Hasan Alizada — HAAL-103. Grid or list on the To-Do page (FR-TODO-05, D-110): the user
// setting `note_layout`, one choice for every device, saved as the other layout settings (settingChoice, HAAL-195).
import type { QueryClient } from "@tanstack/react-query";

import { setSettingChoice } from "@/api/settingChoice";
import type { NoteLayout } from "@/lib/notes";

/** Shows the notes in a grid or a list and saves the choice; true when saved. */
export function setNoteLayout(
  client: QueryClient,
  user: string,
  layout: NoteLayout,
  previous: NoteLayout,
): Promise<boolean> {
  return setSettingChoice(client, user, "note_layout", layout, previous);
}
