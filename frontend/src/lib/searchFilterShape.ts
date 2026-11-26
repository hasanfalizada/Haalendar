// +++===+++ 2026-11-26 16:35 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). The filters of the search window and the empty
// filter, apart from the matching code of searchFilter.ts: the window's open state (searchOpen) is in the start bundle
// and needs only these, not recurrence, day lists and Markdown.
import type { Color } from "@/api/generated/types.gen";
import type { Priority } from "@/atoms/items/priority";

import type { SearchModule } from "./search";

export interface SearchFilter {
  modules: SearchModule[];
  /** "YYYY-MM-DD" or null; one alone is that day. */
  from: string | null;
  to: string | null;
  calendars: string[];
  colors: Color[];
  priorities: Priority[];
  /** Label names, folded. */
  labels: string[];
}

export const NO_FILTER: SearchFilter = {
  modules: [],
  from: null,
  to: null,
  calendars: [],
  colors: [],
  priorities: [],
  labels: [],
};
