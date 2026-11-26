// +++===+++ 2026-11-26 16:20 +04 — Hasan Alizada — HAAL-143 (NFR 4.3, D-128). The search window and command palette in the
// shell: its keys ("/" and Ctrl/Cmd+K) and its open state are here, in the start bundle; the window (search, commands,
// the Markdown of the results) is a chunk loaded the first time it opens, so the first page loads less JavaScript.
import { Dialog as RadixDialog } from "radix-ui";
import { lazy, Suspense } from "react";

import { useShortcut } from "@/lib/shortcuts";

import { searchMode, setSearchOpen, useSearchOpen } from "./searchOpen";

const SearchWindow = lazy(() => import("./SearchDialog"));

export function SearchDialog() {
  const open = useSearchOpen();
  useShortcut({
    id: "search",
    keys: ["/"],
    group: "general",
    label: "shortcuts.search",
    handler: () => {
      setSearchOpen(true);
    },
  });
  useShortcut({
    id: "commands",
    keys: ["Mod+K"],
    group: "general",
    label: "shortcuts.commands",
    allowInFields: true,
    allowInDialog: true,
    handler: () => {
      const now = searchMode();
      if (now === "commands") setSearchOpen(false);
      else if (now === "search") setSearchOpen(true, "commands");
      // Not over another dialog (an editor with unsaved changes): the key is left to the browser.
      else if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false;
      else setSearchOpen(true, "commands");
      return undefined;
    },
  });
  return (
    <RadixDialog.Root open={open} onOpenChange={setSearchOpen}>
      {open ? (
        <Suspense fallback={null}>
          <SearchWindow />
        </Suspense>
      ) : null}
    </RadixDialog.Root>
  );
}
