// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-110. The user's boards from the local database (offline too, following
// sync and live updates), as lists for the boards page (D-90), plus the user's id.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { meQuery } from "@/api/session";
import { type BoardLists, boardLists } from "@/lib/boards";
import { localKeys, localRows } from "@/sync";

type Row = Record<string, unknown>;

export interface Boards extends BoardLists {
  user: string;
  rows: Row[];
  /** Whether the local rows have been read (a board not found before that is not missing yet). */
  loaded: boolean;
}

export function useBoards(): Boards {
  const { data: me } = useQuery(meQuery);
  const user = me?.id ?? "";
  const { data: rows = [], isSuccess } = useQuery({
    queryKey: [...localKeys.table("board"), user],
    queryFn: () => (user ? localRows(user, "board") : Promise.resolve([])),
    enabled: Boolean(user),
  });
  const lists = useMemo(() => boardLists(rows, user), [rows, user]);
  return { ...lists, user, rows, loaded: isSuccess };
}
