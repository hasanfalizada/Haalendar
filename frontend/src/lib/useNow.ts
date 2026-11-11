// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-116. Now, moved every minute (which reminders are still ahead) — the note
// cards' clock of HAAL-105, shared with the board's cards (D-94).
import { useEffect, useState } from "react";

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}
