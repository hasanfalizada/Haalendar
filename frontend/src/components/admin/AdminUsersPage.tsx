// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Admin panel — users (FR-ACC-06): search and status filter, keyset
// "load more", invite, change role, unlock, reset password, deactivate (soft) and reactivate. One DOM for all screen
// sizes: a table on ≥ md, stacked cards on phones. The own row has no actions ("not on yourself"); consequential
// actions are confirmed; the server asks for re-authentication when needed.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Results are reported through runWrite (one notification per write).
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { adminKeys, adminUsersQuery, type UserStatus } from "@/api/admin";
import { adminUpdateUser, adminUserAction } from "@/api/generated/sdk.gen";
import type { AdminUser } from "@/api/generated/types.gen";
import { problemCode } from "@/api/problem";
import { meQuery } from "@/api/session";
import { runWrite } from "@/api/write";
import { useReauth } from "@/components/auth/reauth";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input, Select } from "@/components/ui/input";
import { formatInstant, useDisplayTimeZone } from "@/lib/datetime";
import { cn } from "@/lib/utils";

import { useAdminReasons } from "./admin-errors";
import { InstanceSettingsCard } from "./InstanceSettingsCard";
import { InviteDialog } from "./InviteDialog";
import { type OneTimePassword, OneTimePasswordDialog } from "./OneTimePasswordDialog";
import { PendingInvites } from "./PendingInvites";

type Action = "deactivate" | "reactivate" | "unlock" | "reset-password";
type Pending =
  { kind: "role"; user: AdminUser; role: "admin" | "user" } | { kind: "action"; user: AdminUser; action: Action };

const STATUSES: readonly UserStatus[] = ["active", "deactivated", "locked", "unverified"];
const STATUS_STYLE: Record<UserStatus, string> = {
  active: "bg-primary-tint text-primary",
  deactivated: "bg-surface-2 text-muted",
  locked: "bg-warn-bg text-warn-fg",
  unverified: "bg-surface-2 text-fg",
};
const CONFIRMED: ReadonlySet<Action> = new Set(["deactivate", "reset-password"]);

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);
  return debounced;
}

export function AdminUsersPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const withReauth = useReauth();
  const adminReasons = useAdminReasons();
  const { data: me } = useQuery(meQuery);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "">("");
  const q = useDebounced(search, 300);
  const users = useInfiniteQuery(adminUsersQuery({ q, status }));
  const rows = users.data?.pages.flatMap((page) => page.data) ?? [];

  const [pending, setPending] = useState<Pending | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [oneTime, setOneTime] = useState<OneTimePassword | null>(null);

  // +++===+++ 2026-10-15 — Hasan Alizada — HAAL-169. Instants are shown in the profile's time zone.
  const timeZone = useDisplayTimeZone();
  const formatDate = (value: string) => formatInstant(value, timeZone, i18n.language);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: adminKeys.all });
  }

  async function changeRole(user: AdminUser, role: "admin" | "user") {
    await runWrite({
      name: "admin_role_change",
      run: () =>
        withReauth(() =>
          adminUpdateUser({
            path: { id: user.id },
            headers: { "If-Match": `"${String(user.version)}"` },
            body: { role },
          }),
        ),
      success: t("admin.results.role", { name: user.display_name, role: t(`admin.role.${role}`) }),
      reasons: (problem) => adminReasons(problem),
    });
    await refresh();
  }

  async function runAction(user: AdminUser, action: Action) {
    await runWrite({
      name: `admin_${action.replace("-", "_")}`,
      run: () => withReauth(() => adminUserAction({ path: { id: user.id, action } })),
      success: (data) =>
        data.delivery === "one_time_password"
          ? t("admin.results.resetOneTime", { name: user.display_name })
          : t(`admin.results.${action === "reset-password" ? "resetEmail" : action}`, {
              name: user.display_name,
              email: user.email,
            }),
      reasons: (problem) => adminReasons(problem, action === "reset-password" ? "reset" : "default"),
      onSuccess: (data) => {
        if (data.delivery === "one_time_password" && data.one_time_password) {
          setOneTime({ email: user.email, password: data.one_time_password });
        }
      },
    });
    await refresh();
  }

  function request(next: Pending) {
    if (next.kind === "action" && !CONFIRMED.has(next.action)) {
      void runAction(next.user, next.action);
      return;
    }
    setPending(next);
  }

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === "role") await changeRole(pending.user, pending.role);
    else await runAction(pending.user, pending.action);
    setPending(null);
  }

  const loadErrorCode = users.isError ? problemCode(users.error) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h1 className="flex-1 text-lg font-semibold">{t("admin.title")}</h1>
        <Button
          variant="primary"
          onClick={() => {
            setInviteOpen(true);
          }}
        >
          <UserPlus aria-hidden />
          {t("admin.invite.open")}
        </Button>
      </div>

      <InstanceSettingsCard />
      <PendingInvites formatDate={formatDate} />

      <div className="flex flex-col gap-2 px-4 py-3 md:flex-row">
        <Input
          type="search"
          aria-label={t("admin.search")}
          placeholder={t("admin.search")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className="md:max-w-xs"
        />
        <Select
          aria-label={t("admin.statusFilter")}
          value={status}
          onChange={(e) => {
            setStatus(STATUSES.find((s) => s === e.target.value) ?? "");
          }}
          className="md:w-48"
        >
          <option value="">{t("admin.statusAll")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.status.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {users.isError ? (
        <div
          role="alert"
          className="mx-4 flex flex-wrap items-center gap-3 rounded-sm bg-warn-bg px-3 py-2 text-warn-fg"
        >
          <span className="flex-1">
            {loadErrorCode === "totp_required" ? t("admin.errors.totpRequired") : t("admin.errors.loadFailed")}
          </span>
          <Button onClick={() => void users.refetch()}>{t("common.retry")}</Button>
        </div>
      ) : null}

      <div className="px-4 pb-4">
        <table className="w-full border-collapse text-left">
          <thead className="max-md:sr-only">
            <tr className="border-b border-line text-xs text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("admin.columns.user")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("admin.columns.role")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("admin.columns.status")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("admin.columns.twoFactor")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("admin.columns.lastLogin")}
              </th>
              <th scope="col" className="py-2 font-medium">
                <span className="sr-only">{t("admin.columns.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => {
              const self = user.id === me?.id;
              return (
                <tr
                  key={user.id}
                  className="border-b border-line align-middle max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:py-2"
                >
                  <td className="py-2 pr-3 max-md:col-start-1 max-md:py-0">
                    <div className="font-medium">
                      {user.display_name}
                      {self ? (
                        <span className="ml-2 rounded-sm bg-surface-2 px-1.5 py-0.5 text-xs text-muted">
                          {t("admin.you")}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">{user.email}</div>
                  </td>
                  <td className="py-2 pr-3 max-md:col-start-1 max-md:py-0 max-md:text-xs">
                    {t(`admin.role.${user.role}`)}
                  </td>
                  <td className="py-2 pr-3 max-md:col-start-1 max-md:py-0">
                    <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", STATUS_STYLE[user.status])}>
                      {t(`admin.status.${user.status}`)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 max-md:hidden">
                    {user.totp_enabled ? t("admin.twoFactorOn") : t("admin.twoFactorOff")}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted max-md:col-start-1 max-md:py-0">
                    <span className="md:hidden">{t("admin.columns.lastLogin")}: </span>
                    {user.last_login_at ? formatDate(user.last_login_at) : t("admin.never")}
                  </td>
                  <td className="py-2 text-right max-md:col-start-2 max-md:row-span-5 max-md:row-start-1 max-md:self-center">
                    {self ? null : <RowActions user={user} onRequest={request} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {users.isSuccess && rows.length === 0 ? (
          <p className="py-8 text-center text-muted">{t("admin.empty")}</p>
        ) : null}
        {users.hasNextPage ? (
          <div className="flex justify-center pt-3">
            <Button onClick={() => void users.fetchNextPage()} disabled={users.isFetchingNextPage}>
              {t("admin.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
        }}
        onAccountCreated={setOneTime}
      />
      <OneTimePasswordDialog
        value={oneTime}
        onClose={() => {
          setOneTime(null);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title={pending ? confirmTitle(pending, t) : ""}
        body={pending ? confirmBody(pending, t) : ""}
        confirmLabel={pending ? confirmLabel(pending, t) : ""}
        danger={pending?.kind === "action" && pending.action === "deactivate"}
        onConfirm={confirmPending}
        onClose={() => {
          setPending(null);
        }}
      />
    </div>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function confirmTitle(p: Pending, t: T): string {
  if (p.kind === "role") return t("admin.confirm.roleTitle", { name: p.user.display_name });
  return p.action === "deactivate"
    ? t("admin.confirm.deactivateTitle", { name: p.user.display_name })
    : t("admin.confirm.resetTitle", { name: p.user.display_name });
}

function confirmBody(p: Pending, t: T): string {
  if (p.kind === "role") return p.role === "admin" ? t("admin.confirm.makeAdminBody") : t("admin.confirm.makeUserBody");
  return p.action === "deactivate" ? t("admin.confirm.deactivateBody") : t("admin.confirm.resetBody");
}

function confirmLabel(p: Pending, t: T): string {
  if (p.kind === "role") return p.role === "admin" ? t("admin.actions.makeAdmin") : t("admin.actions.makeUser");
  return p.action === "deactivate" ? t("admin.actions.deactivate") : t("admin.actions.resetPassword");
}

function RowActions({ user, onRequest }: { user: AdminUser; onRequest: (next: Pending) => void }) {
  const { t } = useTranslation();
  const deactivated = user.status === "deactivated";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("admin.actionsFor", { name: user.display_name })}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          onSelect={() => {
            onRequest({ kind: "role", user, role: user.role === "admin" ? "user" : "admin" });
          }}
        >
          {user.role === "admin" ? t("admin.actions.makeUser") : t("admin.actions.makeAdmin")}
        </DropdownMenuItem>
        {user.status === "locked" ? (
          <DropdownMenuItem
            onSelect={() => {
              onRequest({ kind: "action", user, action: "unlock" });
            }}
          >
            {t("admin.actions.unlock")}
          </DropdownMenuItem>
        ) : null}
        {deactivated ? null : (
          <DropdownMenuItem
            onSelect={() => {
              onRequest({ kind: "action", user, action: "reset-password" });
            }}
          >
            {t("admin.actions.resetPassword")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {deactivated ? (
          <DropdownMenuItem
            onSelect={() => {
              onRequest({ kind: "action", user, action: "reactivate" });
            }}
          >
            {t("admin.actions.reactivate")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            danger
            onSelect={() => {
              onRequest({ kind: "action", user, action: "deactivate" });
            }}
          >
            {t("admin.actions.deactivate")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
