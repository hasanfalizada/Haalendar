// +++===+++ 2026-11-25 22:47 +04 — Hasan Alizada — HAAL-123 (D-126). The commands of the palette (FR-INT-03): go to a
// module, a board by its name, today, the trash, the settings (the users for an administrator), and create an event,
// a note or a list. With words typed, the commands whose name matches them (as the search matches: word starts in any
// order, case and accents ignored) and, after them, "Create …" with the words as the title: an event, a note, and a
// card on each board the user may write to that has a column (the board open now first, at most five).
import { matchesQuery } from "./search";

type Row = Record<string, unknown>;

export type ModulePath = "/calendar" | "/todo" | "/kanban" | "/trash" | "/admin" | "/settings";

export type CommandAction =
  | { kind: "module"; to: ModulePath }
  | { kind: "today" }
  | { kind: "board"; boardId: string }
  | { kind: "newEvent"; title?: string }
  | { kind: "newNote"; list: boolean; title?: string }
  | { kind: "newCard"; boardId: string; columnId: string; title: string };

export type CommandGroup = "go" | "create";

export interface PaletteCommand {
  id: string;
  group: CommandGroup;
  /** The name shown and matched. */
  label: string;
  /** A shortcut that does the same, as the registry writes it ("Alt+1"). */
  keys?: string;
  action: CommandAction;
}

export interface CommandInput {
  /** Boards the user sees, in board order: own first, then shared. */
  boards: readonly Row[];
  /** Ids of the boards the user may add cards to. */
  writable: ReadonlySet<string>;
  /** The first open column of a board, if any. */
  firstColumn: (boardId: string) => string | undefined;
  admin: boolean;
  /** The board open now, offered first for a new card. */
  currentBoard?: string;
  /** Translates a key of the interface (i18next `t`). */
  t: (key: string, values?: Record<string, string>) => string;
}

const MODULES: readonly { to: ModulePath; label: string; keys?: string; admin?: boolean }[] = [
  { to: "/calendar", label: "nav.calendar", keys: "Alt+1" },
  { to: "/todo", label: "nav.todo", keys: "Alt+2" },
  { to: "/kanban", label: "nav.kanban", keys: "Alt+3" },
  { to: "/trash", label: "nav.trash" },
  { to: "/admin", label: "nav.users", admin: true },
  { to: "/settings", label: "nav.settings" },
];

export const CARD_BOARDS_MAX = 5;

/** The commands without typed words: where to go and what to create. */
export function baseCommands(input: CommandInput): PaletteCommand[] {
  const { t } = input;
  const go: PaletteCommand[] = [
    ...MODULES.filter((module) => !module.admin || input.admin).map((module): PaletteCommand => ({
      id: `go:${module.to}`,
      group: "go",
      label: t(module.label),
      ...(module.keys ? { keys: module.keys } : {}),
      action: { kind: "module", to: module.to },
    })),
    { id: "go:today", group: "go", label: t("commands.today"), action: { kind: "today" } },
    ...input.boards.map((board): PaletteCommand => ({
      id: `go:board:${String(board.id)}`,
      group: "go",
      label: t("commands.board", { name: String(board.name) }),
      action: { kind: "board", boardId: String(board.id) },
    })),
  ];
  const create: PaletteCommand[] = [
    { id: "new:event", group: "create", label: t("commands.newEvent"), action: { kind: "newEvent" } },
    { id: "new:note", group: "create", label: t("commands.newNote"), action: { kind: "newNote", list: false } },
    { id: "new:list", group: "create", label: t("commands.newList"), action: { kind: "newNote", list: true } },
  ];
  return [...go, ...create];
}

/** "Create …" with the typed words as the title. */
export function titledCommands(input: CommandInput, title: string): PaletteCommand[] {
  const { t } = input;
  const boards = input.boards
    .filter((board) => input.writable.has(String(board.id)) && input.firstColumn(String(board.id)))
    .sort((a, b) => Number(b.id === input.currentBoard) - Number(a.id === input.currentBoard))
    .slice(0, CARD_BOARDS_MAX);
  return [
    {
      id: "titled:event",
      group: "create",
      label: t("commands.createEvent", { title }),
      action: { kind: "newEvent", title },
    },
    {
      id: "titled:note",
      group: "create",
      label: t("commands.createNote", { title }),
      action: { kind: "newNote", list: false, title },
    },
    ...boards.map((board): PaletteCommand => ({
      id: `titled:card:${String(board.id)}`,
      group: "create",
      label: t("commands.createCard", { title, board: String(board.name) }),
      action: {
        kind: "newCard",
        boardId: String(board.id),
        columnId: input.firstColumn(String(board.id)) ?? "",
        title,
      },
    })),
  ];
}

/** The commands for what is typed: all without words; with words the matching ones, then "Create …" with them. */
export function pickCommands(input: CommandInput, query: string): PaletteCommand[] {
  const title = query.trim();
  const base = baseCommands(input);
  if (title === "") return base;
  return [...base.filter((command) => matchesQuery(command.label, title)), ...titledCommands(input, title)];
}
