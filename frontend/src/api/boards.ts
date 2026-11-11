// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. The members of a board (D-97) — its owner and everyone with an
// active share — on the generated client: the people a card can be assigned to. The last answer is kept on the device
// (per board, a convenience only) so the assignees keep their names offline.
import { queryOptions } from "@tanstack/react-query";

import { listBoardMembers } from "./generated/sdk.gen";
import type { ListBoardMembersResponse } from "./generated/types.gen";
import { ApiError } from "./problem";

export type BoardMember = ListBoardMembersResponse["data"][number];

const storeKey = (boardId: string) => `haalendar.members.${boardId}`;

function remembered(boardId: string): BoardMember[] | undefined {
  try {
    const raw = window.localStorage.getItem(storeKey(boardId));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return Array.isArray(parsed) ? (parsed as BoardMember[]) : undefined;
  } catch {
    return undefined;
  }
}

function remember(boardId: string, members: BoardMember[]): void {
  try {
    window.localStorage.setItem(storeKey(boardId), JSON.stringify(members));
  } catch {
    // Blocked storage: the names come back with the next answer.
  }
}

export const boardKeys = {
  members: (boardId: string) => ["boards", boardId, "members"] as const,
};

export function boardMembersQuery(boardId: string) {
  return queryOptions({
    queryKey: boardKeys.members(boardId),
    queryFn: async () => {
      const { data, error } = await listBoardMembers({ path: { id: boardId } });
      if (error !== undefined) throw new ApiError(error);
      remember(boardId, data.data);
      return data.data;
    },
    initialData: () => remembered(boardId),
    initialDataUpdatedAt: 0,
    retry: false,
  });
}
