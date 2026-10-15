// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-166. Profile (FR-ACC-08) in Settings: avatar upload/removal, display
// name, time zone and language (English only in v1.0). Saves with If-Match on the profile version; a conflict reloads
// the profile and says so. Changes need a connection (profile data is not edited offline).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { removeAvatar, updateProfile } from "@/api/generated/sdk.gen";
import type { Me } from "@/api/generated/types.gen";
import { fieldErrorsOf, isProblem, problemCode } from "@/api/problem";
import { avatarProblem, uploadAvatarFile } from "@/api/profile";
import { meQuery, meQueryKey, rememberSession, signOut } from "@/api/session";
import { TimeZoneSelect } from "@/components/auth/TimeZoneSelect";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { describeError, log } from "@/lib/log";
import { cn } from "@/lib/utils";

interface Banner {
  ok: boolean;
  text: string;
}

export function ProfileSection() {
  const { data: me } = useQuery(meQuery);
  // The banner lives here: the form below is re-created for every new profile version (fresh field values).
  const [banner, setBanner] = useState<Banner | null>(null);
  if (!me) return null;
  return <ProfileForm key={me.version} me={me} banner={banner} setBanner={setBanner} />;
}

interface ProfileFormProps {
  me: Me;
  banner: Banner | null;
  setBanner: (banner: Banner | null) => void;
}

function ProfileForm({ me, banner, setBanner }: ProfileFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(me.display_name);
  const [timeZone, setTimeZone] = useState(me.time_zone);
  const [nameError, setNameError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== me.display_name || timeZone !== me.time_zone;

  function store(updated: Me) {
    rememberSession(queryClient, updated, updated.csrf_token ?? me.csrf_token ?? "");
  }

  async function onSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);
    if (!name.trim()) {
      setNameError(t("auth.required"));
      return;
    }
    setNameError(undefined);
    setBusy(true);
    try {
      const { data, error } = await updateProfile({
        headers: { "If-Match": `"${String(me.version)}"` },
        body: {
          ...(name.trim() !== me.display_name ? { display_name: name.trim() } : {}),
          ...(timeZone !== me.time_zone ? { time_zone: timeZone } : {}),
        },
      });
      if (error !== undefined) {
        const code = problemCode(error);
        log.warn("profile_save_failed", { code });
        if (code === "version_conflict") {
          await queryClient.invalidateQueries({ queryKey: meQueryKey });
          setBanner({ ok: false, text: t("profile.conflict") });
        } else if (code === "validation_failed" && isProblem(error)) {
          const nameDetail = fieldErrorsOf(error).find((e) => e.field === "display_name")?.detail;
          if (nameDetail) setNameError(nameDetail);
          else setBanner({ ok: false, text: fieldErrorsOf(error)[0]?.detail ?? t("profile.failed") });
        } else {
          setBanner({ ok: false, text: t("profile.failed") });
        }
        return;
      }
      log.info("profile_saved");
      setBanner({ ok: true, text: t("profile.saved") });
      store(data);
    } catch (err) {
      log.warn("profile_save_unreachable", { error: describeError(err) });
      setBanner({ ok: false, text: t("profile.offline") });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBanner(null);
    const local = avatarProblem(file);
    if (local) {
      setBanner({ ok: false, text: local === "type" ? t("profile.avatarType") : t("profile.avatarSize") });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await uploadAvatarFile(file);
      if (error !== undefined) {
        const code = problemCode(error);
        log.warn("avatar_upload_failed", { code });
        setBanner({
          ok: false,
          text: code === "payload_too_large" ? t("profile.avatarSize") : t("profile.avatarType"),
        });
        return;
      }
      log.info("avatar_uploaded");
      store(data);
      setBanner({ ok: true, text: t("profile.avatarSaved") });
    } catch (err) {
      log.warn("avatar_upload_unreachable", { error: describeError(err) });
      setBanner({ ok: false, text: t("profile.offline") });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onRemove() {
    setBanner(null);
    setBusy(true);
    try {
      const { data, error } = await removeAvatar();
      if (error !== undefined) {
        log.warn("avatar_remove_failed", { code: problemCode(error) });
        setBanner({ ok: false, text: t("profile.failed") });
        return;
      }
      log.info("avatar_removed");
      store(data);
      setBanner({ ok: true, text: t("profile.avatarRemoved") });
    } catch (err) {
      log.warn("avatar_remove_unreachable", { error: describeError(err) });
      setBanner({ ok: false, text: t("profile.offline") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-4 border-t border-line p-4">
      <h2 id="profile-title" className="text-[11px] font-semibold tracking-wider text-muted uppercase">
        {t("profile.title")}
      </h2>

      {banner ? (
        <p
          role={banner.ok ? "status" : "alert"}
          className={cn(
            "rounded-sm px-3 py-2 text-[13px]",
            banner.ok ? "bg-primary-tint text-primary" : "bg-warn-bg text-warn-fg",
          )}
        >
          {banner.text}
        </p>
      ) : null}

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

      <form onSubmit={(e) => void onSave(e)} noValidate className="flex max-w-md flex-col gap-4">
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
        <Button
          className="w-fit"
          onClick={() => {
            void signOut(queryClient).then(() => navigate({ to: "/login", replace: true }));
          }}
        >
          {t("auth.signOut")}
        </Button>
      </div>
    </section>
  );
}
