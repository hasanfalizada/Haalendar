// +++===+++ 2026-11-25 11:40 +04 — Hasan Alizada — HAAL-195. A layout setting switched in a page's header (the To-Do
// page's grid or list, D-110; the day view's list or hours, D-124), one choice for every device. The page follows at
// once (the cached settings and the synced settings row change before the request); a refused save puts the previous
// value back. Saves run one after another, so quick clicks end on the last choice. Needs a connection, like the other
// settings. Moved here from the To-Do page's noteLayout (HAAL-103).
import type { QueryClient } from "@tanstack/react-query";

import { getSettings, updateSettings } from "@/api/generated/sdk.gen";
import type { Settings } from "@/api/generated/types.gen";
import { settingsQueryKey } from "@/api/settings";
import { runWrite } from "@/api/write";
import { localKeys } from "@/sync";
import { localDb } from "@/sync/db";

export type SettingChoice = "note_layout" | "day_layout";

async function show<K extends SettingChoice>(
  client: QueryClient,
  user: string,
  field: K,
  value: Settings[K],
): Promise<void> {
  client.setQueryData<Settings>(settingsQueryKey, (old) => (old ? { ...old, [field]: value } : old));
  const db = await localDb(user);
  if (await db.settings.get(user)) await db.settings.update(user, { [field]: value });
  await client.invalidateQueries({ queryKey: localKeys.table("settings") });
}

let saving: Promise<unknown> = Promise.resolve();

/** Shows the page with `value` for `field` and saves the choice; true when saved. */
export async function setSettingChoice<K extends SettingChoice>(
  client: QueryClient,
  user: string,
  field: K,
  value: Settings[K],
  previous: Settings[K],
): Promise<boolean> {
  await show(client, user, field, value);
  const send = async () => {
    // The current version, read anew (another device may have changed the settings).
    const read = await getSettings();
    if (read.error !== undefined) return read;
    return updateSettings({
      headers: { "If-Match": `"${String(read.data.version)}"` },
      body: { [field]: value },
    });
  };
  const save = () =>
    runWrite<Settings>({
      name: field,
      run: async () => {
        const first = await send();
        // Changed meanwhile on another device: once more on the current version.
        return first.response?.status === 412 ? send() : first;
      },
      success: () => null,
      onSuccess: async (saved) => {
        client.setQueryData(settingsQueryKey, saved);
        await show(client, user, field, saved[field]);
      },
    });
  const turn = saving.then(save, save);
  saving = turn;
  const result = await turn;
  if (!result.ok) await show(client, user, field, previous);
  return result.ok;
}
