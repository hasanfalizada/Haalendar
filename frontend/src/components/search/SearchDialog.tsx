// +++===+++ 2026-11-23 14:30 +04 — Hasan Alizada — HAAL-039 (D-119). The search window (FR-X-10, FR-CAL-21, legacy
// F-06 and F-30): opened from the search field of a header or by "/", it opens out over the dimmed page, the field at
// its top and below it the results by module — Calendar ("title — date", the next date of a series), To-Do, Boards —
// with the words highlighted, and the line where they were found when not in the title. Arrow keys move through the
// results (combobox and listbox), Enter or a click opens one: an event on its day with its card, a note, a card on its
// board. A date typed as YYYY-MM-DD offers that day first, so Enter opens it. Works on the items of this device, so it
// works offline. On phones it takes the whole screen.
// +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). Opened by Ctrl+K (and on phones by the search
// field) it is the command palette: the commands of lib/commands while the field is empty, and with words the matching
// commands and "Create …" with them before the results. Pressed again Ctrl+K closes it; from the search it turns it
// into the palette. An event and a note open their editors with the title; a card is added at once to the first
// column of the board, with Undo, and the board opens.
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import { type ReactNode, useDeferredValue, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSettings } from "@/api/settings";
import { meQuery } from "@/api/session";
import { useCalendars } from "@/components/calendar/useCalendars";
import { createCard } from "@/components/kanban/cardWrites";
import { boardLists } from "@/lib/boards";
import { newCardPosition } from "@/lib/cards";
import { columnsOf } from "@/lib/columns";
import { type CommandAction, type PaletteCommand, pickCommands } from "@/lib/commands";
import { asView } from "@/lib/calendarView";
import { isRealDate, todayIn, useDisplayTimeZone } from "@/lib/datetime";
import { dayLabel } from "@/lib/dayView";
import { dayToShow } from "@/lib/duplicates";
import { itemTarget } from "@/lib/links";
import { log } from "@/lib/log";
import { toPlainText } from "@/lib/markdown-text";
import {
  fieldText,
  fold,
  highlightRanges,
  type SearchHit,
  type SearchModule,
  searchItems,
  snippet,
} from "@/lib/search";
import { compileFilter } from "@/lib/searchFilter";
import { keyCaps } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { localKeys, localRows } from "@/sync";
import type { EntityType } from "@/sync/db";

import { SearchFilters } from "./SearchFilters";
import { closedForResult, closeSearchForResult, setSearchFilter, useSearchFilter, useSearchMode } from "./searchOpen";

const MODULES: readonly SearchModule[] = ["calendar", "todo", "kanban"];

type Option =
  { kind: "date"; date: string } | { kind: "command"; command: PaletteCommand } | { kind: "hit"; hit: SearchHit };

const GROUPS = ["go", "create"] as const;

const keyOf = (option: Option) =>
  option.kind === "date"
    ? "date"
    : option.kind === "command"
      ? `command:${option.command.id}`
      : String(option.hit.row.id);

/** The text with the query's words marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of highlightRanges(text, query)) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <mark key={start} className="rounded-xs bg-accent/35 text-fg">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}

function useLocal(user: string | undefined, entity: EntityType) {
  const { data = [] } = useQuery({
    queryKey: [...localKeys.table(entity), user ?? ""],
    queryFn: () => (user ? localRows(user, entity) : Promise.resolve([])),
    enabled: Boolean(user),
  });
  return data;
}

// +++===+++ 2026-11-26 16:20 +04 — Hasan Alizada — HAAL-143 (D-128). The window itself, a chunk of its own loaded the first
// time it opens (SearchLauncher keeps the keys and the open state in the start bundle).
export default function SearchWindow() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const viewerTz = useDisplayTimeZone();
  const { data: me } = useQuery(meQuery);
  const user = me?.id;
  const items = useLocal(user, "item");
  const checklistItems = useLocal(user, "checklist_item");
  // +++===+++ 2026-11-25 09:45 +04 — Hasan Alizada — HAAL-114. Card comments are searched too (D-123).
  const comments = useLocal(user, "comment");
  const boards = useLocal(user, "board");
  const columnRows = useLocal(user, "board_column");
  const shares = useLocal(user, "share");
  const mode = useSearchMode();
  const palette = mode === "commands";
  const location = useRouterState({ select: (state) => state.location });
  // +++===+++ 2026-11-23 12:00 +04 — Hasan Alizada — HAAL-046 (D-120). The filters, under the field.
  const labels = useLocal(user, "label");
  const itemLabels = useLocal(user, "item_label");
  const { shown, own, shared } = useCalendars(user);
  const { week_start: weekStart, default_color: defaultColor } = useSettings();
  const filter = useSearchFilter();
  const [query, setQuery] = useState("");
  // Typing stays quick on many items: the results follow the field when there is time.
  const deferred = useDeferredValue(query);
  const [active, setActive] = useState(0);
  const id = useId();
  const today = todayIn(viewerTz);

  const compiled = useMemo(
    () => compileFilter(filter, { labels, itemLabels, viewerTz, today }),
    [filter, labels, itemLabels, viewerTz, today],
  );
  const shownCalendars = useMemo(
    () =>
      [...own, ...shared]
        .filter((calendar) => shown(calendar.id))
        .map((calendar) => ({ id: String(calendar.id), name: String(calendar.name) })),
    [own, shared, shown],
  );
  const labelNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const label of labels) {
      const name = typeof label.name === "string" ? label.name.trim() : "";
      if (!label.deleted_at && name && !names.has(fold(name))) names.set(fold(name), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b));
  }, [labels]);
  const results = useMemo(
    () => searchItems({ items, checklistItems, comments, boards, calendarShown: shown }, deferred, 20, compiled),
    [items, checklistItems, comments, boards, shown, deferred, compiled],
  );
  const trimmed = deferred.trim();
  const asked = trimmed !== "" || compiled.active;
  const currentBoard = /^\/kanban\/([^/]+)$/.exec(location.pathname)?.[1];
  const commands = useMemo(() => {
    if (!palette || !user) return [];
    const lists = boardLists(boards, user);
    const writable = new Set([
      ...lists.own.map((board) => String(board.id)),
      ...shares
        .filter(
          (share) =>
            share.container_kind === "board" &&
            share.grantee_id === user &&
            share.permission === "edit" &&
            !share.revoked_at,
        )
        .map((share) => String(share.container_id)),
    ]);
    return pickCommands(
      {
        boards: [...lists.own, ...lists.shared],
        writable,
        firstColumn: (boardId) => {
          const first = columnsOf(columnRows, boardId).active[0];
          return first ? String(first.id) : undefined;
        },
        admin: me.role === "admin",
        ...(currentBoard ? { currentBoard } : {}),
        t: (key, values) => t(key as never, values),
      },
      deferred,
    );
  }, [palette, user, boards, shares, columnRows, me, currentBoard, t, deferred]);
  const options = useMemo<Option[]>(
    () => [
      ...(isRealDate(trimmed) ? [{ kind: "date" as const, date: trimmed }] : []),
      ...GROUPS.flatMap((group) =>
        commands.filter((command) => command.group === group).map((command) => ({ kind: "command" as const, command })),
      ),
      ...MODULES.flatMap((module) => results[module].map((hit) => ({ kind: "hit" as const, hit }))),
    ],
    [results, trimmed, commands],
  );
  const boardNames = useMemo(() => new Map(boards.map((board) => [String(board.id), board.name])), [boards]);
  const current = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (index: number) => `${id}-option-${String(index)}`;

  // The day a new event starts on and the view: the ones shown in the calendar, else today and the view last chosen.
  const calendarPlace = () => {
    const { date, view } = location.search as { date?: unknown; view?: unknown };
    const calendar = location.pathname === "/calendar";
    return {
      date: calendar && typeof date === "string" && isRealDate(date) ? date : today,
      view: calendar ? asView(view) : undefined,
    };
  };
  const run = (action: CommandAction) => {
    log.info("command_run", { kind: action.kind });
    switch (action.kind) {
      case "module":
        void navigate({ to: action.to });
        return;
      case "today":
        void navigate({ to: "/calendar", search: { date: today } });
        return;
      case "board":
        void navigate({ to: "/kanban/$boardId", params: { boardId: action.boardId } });
        return;
      case "newEvent":
        void navigate({ to: "/calendar", search: { ...calendarPlace(), new: "event", title: action.title } });
        return;
      case "newNote":
        void navigate({ to: "/todo", search: { new: action.list ? "list" : "note", title: action.title } });
        return;
      case "newCard": {
        if (!user) return;
        const card = {
          boardId: action.boardId,
          columnId: action.columnId,
          title: action.title,
          position: newCardPosition(items, action.columnId),
          color: defaultColor,
        };
        void createCard(user, card).then((ok) => {
          if (ok) void navigate({ to: "/kanban/$boardId", params: { boardId: action.boardId } });
        });
      }
    }
  };

  const choose = (option: Option | undefined) => {
    if (!option) return;
    closeSearchForResult();
    if (option.kind === "command") {
      run(option.command.action);
      return;
    }
    if (option.kind === "date") {
      log.info("search_opened", { kind: "date" });
      void navigate({ to: "/calendar", search: { date: option.date, view: "day" } });
      return;
    }
    const { row } = option.hit;
    log.info("search_opened", { kind: String(row.kind) });
    if (row.kind === "event") {
      const date = dayToShow(row, today, viewerTz);
      if (date) void navigate({ to: "/calendar", search: { date, view: "day", event: String(row.id) } });
      return;
    }
    const target = itemTarget(row);
    if (target) void navigate(target);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (options.length === 0) return;
    const last = options.length - 1;
    const move: Record<string, number> = {
      ArrowDown: current >= last ? 0 : current + 1,
      ArrowUp: current <= 0 ? last : current - 1,
      Home: 0,
      End: last,
    };
    if (event.key in move && !(event.key in { Home: 1, End: 1 } && !event.ctrlKey)) {
      event.preventDefault();
      const next = move[event.key] ?? 0;
      setActive(next);
      document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(options[current]);
    }
  };

  const describe = (hit: SearchHit): ReactNode => {
    const { row, field } = hit;
    const parts: ReactNode[] = [];
    if (row.kind === "event") {
      const date = dayToShow(row, today, viewerTz);
      if (date) parts.push(<span key="date">{dayLabel(date, i18n.language)}</span>);
    }
    if (row.kind === "card") {
      const name = boardNames.get(String(row.container_id));
      if (typeof name === "string") parts.push(<span key="board">{name}</span>);
    }
    if (field) {
      const source = fieldText(row, field, checklistItems, comments);
      // The body as plain text; of a checklist only the items with a match, of the comments the ones with a match.
      const plain =
        field === "body"
          ? toPlainText(source, { singleLine: true })
          : field === "checklist"
            ? source
                .split("\n")
                .filter((line) => highlightRanges(line, deferred).length > 0)
                .join(" · ")
            : field === "comments"
              ? source
                  .split("\n\n")
                  .map((comment) => toPlainText(comment, { singleLine: true }))
                  .filter((comment) => highlightRanges(comment, deferred).length > 0)
                  .join(" · ")
              : source;
      parts.push(
        <span key="field" className="min-w-0 truncate">
          {t(`search.fields.${field}`)}: <Marked text={snippet(plain, deferred)} query={deferred} />
        </span>,
      );
    }
    return parts;
  };

  const indexOf = useMemo(() => new Map(options.map((option, at) => [keyOf(option), at])), [options]);
  const optionProps = (option: Option) => {
    const mine = indexOf.get(keyOf(option)) ?? 0;
    return {
      id: optionId(mine),
      role: "option" as const,
      "aria-selected": mine === current,
      onMouseMove: () => {
        if (mine !== current) setActive(mine);
      },
      onClick: () => {
        choose(option);
      },
      className: cn(
        "flex cursor-pointer flex-col gap-0.5 rounded-sm px-3 py-2 pointer-coarse:min-h-11",
        mine === current && "bg-primary-tint",
      ),
    };
  };
  const count = options.filter((option) => option.kind === "hit").length;

  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="search-dim fixed inset-0 z-40 bg-fg/40" />
      <RadixDialog.Content
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          // Opening a result moves to its page: the focus goes there, not back to the search field.
          if (closedForResult()) event.preventDefault();
        }}
        className={cn(
          "search-open fixed z-50 flex flex-col overflow-hidden bg-bg shadow-xl",
          "inset-0 pt-[env(safe-area-inset-top)]",
          "md:inset-auto md:top-[10vh] md:left-1/2 md:max-h-[75vh] md:w-[min(44rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-md md:border md:border-line md:pt-0",
        )}
      >
        <RadixDialog.Title className="sr-only">{palette ? t("commands.label") : t("search.label")}</RadixDialog.Title>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-5 shrink-0 text-muted" aria-hidden />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-label={palette ? t("commands.label") : t("search.label")}
            aria-expanded={options.length > 0}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            {...(options.length > 0 ? { "aria-activedescendant": optionId(current) } : {})}
            placeholder={palette ? t("commands.placeholder") : t("search.placeholder")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <RadixDialog.Close
            className="rounded-sm border border-line px-1.5 text-xs leading-5 text-muted hover:bg-surface pointer-coarse:min-h-11 pointer-coarse:px-3"
            aria-label={t("search.close")}
          >
            <span className="max-md:hidden">Esc</span>
            <X className="size-5 md:hidden" aria-hidden />
          </RadixDialog.Close>
        </div>
        <SearchFilters
          filter={filter}
          onChange={(next) => {
            setSearchFilter(next);
            setActive(0);
          }}
          calendars={shownCalendars}
          labels={labelNames}
          today={today}
          weekStart={weekStart}
        />
        <div aria-live="polite" className="sr-only">
          {asked ? t("search.count", { count }) : ""}
        </div>
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label={t("search.results")}
          className="min-h-0 flex-1 overflow-y-auto p-2"
        >
          {asked || palette ? null : (
            <p className="px-3 py-2 text-[13px] text-muted">
              {t("search.hint")} {t("search.hintFilters")}
            </p>
          )}
          {options[0]?.kind === "date" ? (
            <div {...optionProps(options[0])}>
              <span className="font-medium">
                {t("search.goToDate", { date: dayLabel(options[0].date, i18n.language) })}
              </span>
            </div>
          ) : null}
          {GROUPS.map((group) => {
            const list = commands.filter((command) => command.group === group);
            return list.length > 0 ? (
              <div key={group} role="group" aria-labelledby={`${id}-${group}`} className="mt-1">
                <div
                  id={`${id}-${group}`}
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-xs font-semibold text-muted uppercase"
                >
                  {t(`commands.groups.${group}`)}
                </div>
                {list.map((command) => (
                  <div key={command.id} {...optionProps({ kind: "command", command })}>
                    <span className="flex min-w-0 items-center justify-between gap-3 text-sm font-medium">
                      <span className="truncate">
                        <Marked text={command.label} query={command.id.startsWith("titled:") ? "" : deferred} />
                      </span>
                      {command.keys ? (
                        <span aria-hidden className="flex shrink-0 gap-1 max-md:hidden">
                          {keyCaps(command.keys).map((cap) => (
                            <kbd
                              key={cap}
                              className="rounded-sm border border-line px-1.5 font-sans text-xs leading-5 text-muted"
                            >
                              {cap}
                            </kbd>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null;
          })}
          {MODULES.map((module) =>
            results[module].length > 0 ? (
              <div key={module} role="group" aria-labelledby={`${id}-${module}`} className="mt-1">
                <div
                  id={`${id}-${module}`}
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-xs font-semibold text-muted uppercase"
                >
                  {t(`search.groups.${module}`)}
                </div>
                {results[module].map((hit) => {
                  const title =
                    typeof hit.row.title === "string" && hit.row.title.trim() ? hit.row.title : t("search.noTitle");
                  return (
                    <div key={String(hit.row.id)} {...optionProps({ kind: "hit", hit })}>
                      <span className="truncate text-sm font-medium">
                        <Marked text={title} query={deferred} />
                      </span>
                      <span className="flex min-w-0 gap-2 text-xs text-muted">{describe(hit)}</span>
                    </div>
                  );
                })}
              </div>
            ) : null,
          )}
          {asked && options.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-muted">
              {trimmed ? t("search.none", { query: trimmed }) : t("search.noneFiltered")}
            </p>
          ) : null}
        </div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
