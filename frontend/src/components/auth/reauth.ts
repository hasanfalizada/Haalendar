// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Re-authentication context (provider in ReauthProvider.tsx).
import { createContext, useContext } from "react";

export const REAUTH_CANCELLED = Symbol("reauth_cancelled");

export interface RequestResult<T> {
  data?: T | undefined;
  error?: unknown;
}

export type WithReauth = <T>(run: () => Promise<RequestResult<T>>) => Promise<RequestResult<T>>;

export const ReauthContext = createContext<WithReauth | null>(null);

export function useReauth(): WithReauth {
  const value = useContext(ReauthContext);
  if (!value) throw new Error("useReauth must be used inside <ReauthProvider>");
  return value;
}
