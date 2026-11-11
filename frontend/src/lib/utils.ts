// +++===+++ 2026-10-14 — Hasan Alizada — HAAL-017. Class name merge helper (shadcn/ui convention).
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
