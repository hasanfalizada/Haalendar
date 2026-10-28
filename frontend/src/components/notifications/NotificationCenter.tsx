// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-048. Notification center (FR-X-21, D-52, design system NotificationBell +
// center): the bell in the rail shows the unread count (99+) and opens the list in a popover; on phones the drawer's
// "Notifications" entry opens it full screen. Newest first, unread ones marked by a dot and bold text, "Show more"
// loads older ones, "Mark all read". Choosing a notification marks it read and opens what it is about (sharing → the
// Sharing section of Settings, a ready export → Your data). Texts are built here from kind + payload and always
// rendered as plain text.
// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-170. 44 px rail target on touch devices.
// +++===+++ 2026-10-28 — Hasan Alizada — HAAL-091. A reminder (D-79) reads "Reminder: Dentist — Today, 11:00–12:00" in
// the reader's zone (marked when it was sent late) and opens its day in the calendar with the event's card. A notification
// that leads elsewhere does not send the focus back to the bell (it would close the card it opened).
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Bell, BellRing, Download, Share2, UserMinus, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDisplayTimeZone, useInstantFormat } from "@/lib/datetime";
import { log } from "@/lib/log";
import { cn } from "@/lib/utils";

import { reminderTarget, useReminderText } from "./reminderText";
import { badgeText, type CenterItem, useNotificationCenter } from "./useNotificationCenter";

const ICONS: Record<string, LucideIcon> = {
  share_received: Share2,
  share_revoked: UserMinus,
  export_ready: Download,
  sync_error: AlertTriangle,
  reminder: BellRing,
};

function useText() {
  const { t } = useTranslation();
  const reminderText = useReminderText();
  return (item: CenterItem): string => {
    const p = item.payload as Record<string, unknown>;
    const text = (key: string) => (typeof p[key] === "string" ? p[key] : "");
    const container = t(`notifications.containers.${text("container_kind") === "calendar" ? "calendar" : "other"}`);
    const name = text("container_name") || t("notifications.unnamed");
    const by = text("by_name") || t("notifications.someone");
    switch (item.kind) {
      case "share_received":
        return t("notifications.shareReceived", {
          by,
          container,
          name,
          permission: t(`notifications.permissions.${text("permission") === "edit" ? "edit" : "view"}`),
        });
      case "share_revoked":
        return t("notifications.shareRevoked", { by, container, name });
      case "export_ready":
        return t("notifications.exportReady");
      case "sync_error":
        // +++===+++ 2026-10-21 — Hasan Alizada — HAAL-052. The sync engine says why (conflict / rejected).
        if (text("reason") === "conflict") return t("sync.conflict");
        if (text("reason") === "rejected") return t("sync.rejected");
        if (text("reason") === "deleted_changed") return t("sync.deletedChanged");
        return t("notifications.syncError");
      case "reminder":
        return reminderText(item.payload);
      default:
        return t("notifications.generic");
    }
  };
}

function NotificationPanel({ onNavigate, showTitle = true }: { onNavigate: () => void; showTitle?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const format = useInstantFormat();
  const center = useNotificationCenter();
  const describe = useText();
  const viewerTz = useDisplayTimeZone();
  const now = new Date();

  function open(item: CenterItem) {
    log.info("notification_opened", { kind: item.kind, source: item.source });
    void center.markRead(item);
    // +++===+++ 2026-10-22 — Hasan Alizada — HAAL-054. A sync problem opens Settings → Sync; a delete of something
    // changed elsewhere opens the trash.
    if (item.kind === "sync_error" && item.payload.reason === "deleted_changed") {
      onNavigate();
      void navigate({ to: "/trash" });
      return;
    }
    if (item.kind === "reminder") {
      const target = reminderTarget(item.payload, viewerTz);
      if (target) {
        onNavigate();
        void navigate({ to: "/calendar", search: target });
        return;
      }
    }
    const hash = item.kind.startsWith("share_")
      ? "sharing"
      : item.kind === "export_ready"
        ? "export"
        : item.kind === "sync_error"
          ? "sync"
          : null;
    if (hash) {
      onNavigate();
      void navigate({ to: "/settings", hash });
    }
  }

  return (
    <div className={cn("flex w-full flex-col", showTitle && "max-h-[min(70vh,32rem)] md:w-96")}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        {showTitle ? <h2 className="text-[13px] font-semibold">{t("notifications.title")}</h2> : <span />}
        <Button variant="ghost" disabled={center.unread === 0} onClick={() => void center.markAllRead()}>
          {t("notifications.markAll")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {center.isError ? (
          <p className="p-4 text-[13px] text-muted">{t("notifications.unavailable")}</p>
        ) : center.items.length === 0 ? (
          <p className="p-4 text-[13px] text-muted">
            {center.isLoading ? t("notifications.loading") : t("notifications.empty")}
          </p>
        ) : (
          <ul aria-label={t("notifications.title")} className="divide-y divide-line">
            {center.items.map((item) => {
              const Icon = ICONS[item.kind] ?? Bell;
              const unread = !item.read_at;
              return (
                <li key={`${item.source}:${item.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      open(item);
                    }}
                    className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px]", unread && "font-semibold")}>
                        {unread ? <span className="sr-only">{t("notifications.unread")}: </span> : null}
                        {describe(item)}
                      </span>
                      <time dateTime={item.created_at} className="block text-xs text-muted">
                        {format.relative(item.created_at, now)}
                      </time>
                    </span>
                    {unread ? <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {center.hasMore ? (
          <div className="p-2 text-center">
            <Button variant="ghost" disabled={center.loadingMore} onClick={center.loadMore}>
              {t("notifications.more")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "min-w-4 rounded-full bg-danger px-1 text-center text-[10px] leading-4 font-semibold text-white",
        className,
      )}
    >
      {badgeText(count)}
    </span>
  );
}

/** Rail: the bell with the unread count; the list opens in a popover. */
export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const leaving = useRef(false);
  const { unread } = useNotificationCenter();
  const label = unread > 0 ? t("notifications.bellUnread", { count: unread }) : t("notifications.title");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        title={label}
        className="relative flex size-11 items-center justify-center rounded-sm text-muted hover:bg-surface-2 hover:text-fg pointer-fine:size-10"
      >
        <Bell className="size-5" aria-hidden />
        <Badge count={unread} className="absolute -top-0.5 -right-0.5" />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        onCloseAutoFocus={(event) => {
          if (leaving.current) event.preventDefault();
          leaving.current = false;
        }}
      >
        <NotificationPanel
          onNavigate={() => {
            leaving.current = true;
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Drawer (phones): the entry with the unread count; the list opens full screen. */
export function NotificationsEntry({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const { unread } = useNotificationCenter();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={unread > 0 ? t("notifications.bellUnread", { count: unread }) : t("notifications.title")}
      className="flex h-11 w-full items-center gap-3 rounded-sm px-3 font-medium text-fg hover:bg-surface"
    >
      <Bell className="size-5" aria-hidden />
      <span className="flex-1 text-left">{t("notifications.title")}</span>
      <Badge count={unread} />
    </button>
  );
}

export function NotificationsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const leaving = useRef(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("notifications.title")}
        closeLabel={t("common.close")}
        className="md:max-w-md"
        onCloseAutoFocus={(event: Event) => {
          if (leaving.current) event.preventDefault();
          leaving.current = false;
        }}
      >
        <NotificationPanel
          showTitle={false}
          onNavigate={() => {
            leaving.current = true;
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
