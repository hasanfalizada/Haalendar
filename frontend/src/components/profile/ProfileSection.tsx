// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile (FR-ACC-08) in Settings: avatar upload/removal, display
// name, time zone and language (English only in v1.0). Saves with If-Match on the profile version; a conflict reloads
// the profile and says so. Changes need a connection (profile data is not edited offline).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Results through runWrite (one notification per write). Name and time
// zone are kept as a local draft until the server confirms the save (useDraft); after a conflict or a reload the
// draft is offered for restore. Signing out with drafts on the device asks first (they are deleted with the session).
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-038. Leaving with unsaved changes asks (keep editing / leave — the draft
// stays — / discard); Ctrl/Cmd+Enter saves.
// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. Sign-out through the shared flow (useSignOut, also in the user
// menu); the section is the #profile target of the user menu.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { removeAvatar, updateProfile } from "@/api/generated/sdk.gen";
import type { Me } from "@/api/generated/types.gen";
import { avatarProblem, uploadAvatarFile } from "@/api/profile";
import { meQuery, meQueryKey, rememberSession } from "@/api/session";
import { runWrite } from "@/api/write";
import { TimeZoneSelect } from "@/components/auth/TimeZoneSelect";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DraftNotice } from "@/components/ui/draft-notice";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { useDraft } from "@/lib/useDraft";
import { useSignOut } from "@/lib/useSignOut";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";

export function ProfileSection() {
  const { data: me } = useQuery(meQuery);
  if (!me) return null;
  // The form is re-created for every new profile version (fresh field values).
  return <ProfileForm key={me.version} me={me} />;
}

function ProfileForm({ me }: { me: Me }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  const [name, setName] = useState(me.display_name);
  const [timeZone, setTimeZone] = useState(me.time_zone);
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const { requestSignOut, signOutDialog } = useSignOut();
  const dirty = name.trim() !== me.display_name || timeZone !== me.time_zone;

  const baseline = useMemo(
    () => ({ display_name: me.display_name, time_zone: me.time_zone }),
    [me.display_name, me.time_zone],
  );
  const draft = useDraft({ scope: "profile", values: { display_name: name, time_zone: timeZone }, baseline });
  const guard = useUnsavedGuard({
    dirty,
    hasDraft: true,
    onLeave: () => draft.flush(),
    onDiscard: async () => {
      await draft.discard();
      setName(me.display_name);
      setTimeZone(me.time_zone);
    },
    scope: form,
    onSave: () => {
      if (dirty && !busy) form.current?.requestSubmit();
    },
  });

  function store(updated: Me) {
    rememberSession(queryClient, updated, updated.csrf_token ?? me.csrf_token ?? "");
  }

  async function onSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError(t("auth.required"));
      return;
    }
    setNameError(undefined);
    setBusy(true);
    await draft.flush(); // the edits are on the device before they travel
    const result = await runWrite({
      name: "profile_save",
      run: () =>
        updateProfile({
          headers: { "If-Match": `"${String(me.version)}"` },
          body: {
            ...(name.trim() !== me.display_name ? { display_name: name.trim() } : {}),
            ...(timeZone !== me.time_zone ? { time_zone: timeZone } : {}),
          },
        }),
      success: t("profile.saved"),
      draft: true,
      reasons: (problem) => (problem.code === "version_conflict" ? t("profile.conflict") : null),
      onFieldErrors: (errors) => {
        const detail = errors.find((e) => e.field === "display_name")?.detail;
        if (detail) setNameError(detail);
      },
      onSuccess: async (data) => {
        await draft.commit();
        store(data);
      },
    });
    setBusy(false);
    // The newer version replaces the form; the draft brings the edits back (DraftNotice).
    if (!result.ok && result.code === "version_conflict") await queryClient.invalidateQueries({ queryKey: meQueryKey });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const local = avatarProblem(file);
    if (local) {
      notify.failure(local === "type" ? t("profile.avatarType") : t("profile.avatarSize"));
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setBusy(true);
    await runWrite({
      name: "avatar_upload",
      run: () => uploadAvatarFile(file),
      success: t("profile.avatarSaved"),
      reasons: (problem) =>
        problem.code === "payload_too_large"
          ? t("profile.avatarSize")
          : problem.code === "unsupported_media_type" || problem.code === "validation_failed"
            ? t("profile.avatarType")
            : null,
      onSuccess: store,
    });
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onRemove() {
    setBusy(true);
    await runWrite({
      name: "avatar_remove",
      run: () => removeAvatar(),
      success: t("profile.avatarRemoved"),
      onSuccess: store,
    });
    setBusy(false);
  }

  return (
    <section
      id="profile"
      tabIndex={-1}
      aria-labelledby="profile-title"
      className="flex scroll-mt-2 flex-col gap-4 border-t border-line p-4 outline-none"
    >
      <h2 id="profile-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("profile.title")}
      </h2>

      <DraftNotice
        draft={draft.pending}
        onRestore={() => {
          const fields = draft.restore();
          if (fields?.display_name !== undefined) setName(fields.display_name);
          if (fields?.time_zone !== undefined) setTimeZone(fields.time_zone);
        }}
        onDiscard={() => void draft.discard()}
      />

      <div className="flex items-center gap-4">
        <Avatar name={me.display_name} url={me.avatar_url} size={64} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            id="avatar-file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={t("profile.avatarUpload")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button disabled={busy} onClick={() => fileInput.current?.click()}>
            {me.avatar_url ? t("profile.avatarChange") : t("profile.avatarUpload")}
          </Button>
          {me.avatar_url ? (
            <Button variant="ghost" disabled={busy} onClick={() => void onRemove()}>
              {t("profile.avatarRemove")}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted">{t("profile.avatarHint")}</p>

      <form ref={form} onSubmit={(e) => void onSave(e)} noValidate className="flex max-w-md flex-col gap-4">
        <Field id="profile-name" label={t("profile.name")} error={nameError}>
          {(aria) => (
            <Input
              {...aria}
              autoComplete="name"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          )}
        </Field>
        <TimeZoneSelect id="profile-tz" label={t("auth.timeZone")} value={timeZone} onChange={setTimeZone} />
        <Field id="profile-locale" label={t("profile.language")} hint={t("profile.languageHint")}>
          {(aria) => (
            <Select {...aria} value="en" disabled>
              <option value="en">English</option>
            </Select>
          )}
        </Field>
        <Button type="submit" variant="primary" className="w-fit" disabled={busy || !dirty}>
          {t("profile.save")}
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p>{t("pages.settings.signedInAs", { email: me.email })}</p>
        <Button className="w-fit" onClick={requestSignOut}>
          {t("auth.signOut")}
        </Button>
      </div>

      <UnsavedChangesDialog prompt={guard.prompt} />
      {signOutDialog}
    </section>
  );
}
