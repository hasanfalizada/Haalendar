// +++===+++ 2026-11-18 15:40 +04 — Hasan Alizada — HAAL-103. Grid or list on the To-Do page (FR-TODO-05, D-110): the user
// setting `note_layout`, one choice for every device. The page follows at once (the cached settings and the synced
// settings row change before the request); a refused save puts the previous layout back. Saves run one after another,
// so quick clicks end on the last choice. Needs a connection, like the other settings.
import type { QueryClient } from "@tanstack/react-query";

import { getSettings, updateSettings } from "@/api/generated/sdk.gen";
import type { Settings } from "@/api/generated/types.gen";
import { settingsQueryKey } from "@/api/settings";
import { runWrite } from "@/api/write";
import type { NoteLayout } from "@/lib/notes";
import { localKeys } from "@/sync";
import { localDb } from "@/sync/db";

async function show(client: QueryClient, user: string, layout: NoteLayout): Promise<void> {
  client.setQueryData<Settings>(settingsQueryKey, (old) => (old ? { ...old, note_layout: layout } : old));
  const db = await localDb(user);
  if (await db.settings.get(user)) await db.settings.update(user, { note_layout: layout });
  await client.invalidateQueries({ queryKey: localKeys.table("settings") });
}

let saving: Promise<unknown> = Promise.resolve();

/** Shows the notes in a grid or a list and saves the choice; true when saved. */
export async function setNoteLayout(
  client: QueryClient,
  user: string,
  layout: NoteLayout,
  previous: NoteLayout,
): Promise<boolean> {
  await show(client, user, layout);
  const send = async () => {
    // The current version, read anew (another device may have changed the settings).
    const read = await getSettings();
    if (read.error !== undefined) return read;
    return updateSettings({
      headers: { "If-Match": `"${String(read.data.version)}"` },
      body: { note_layout: layout },
    });
  };
  const save = () =>
    runWrite<Settings>({
      name: "note_layout",
      run: async () => {
        const first = await send();
        // Changed meanwhile on another device: once more on the current version.
        return first.response?.status === 412 ? send() : first;
      },
      success: () => null,
      onSuccess: async (saved) => {
        client.setQueryData(settingsQueryKey, saved);
        await show(client, user, saved.note_layout);
      },
    });
  const turn = saving.then(save, save);
  saving = turn;
  const result = await turn;
  if (!result.ok) await show(client, user, previous);
  return result.ok;
}
