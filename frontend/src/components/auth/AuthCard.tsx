// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-164. Full-screen card shared by setup, sign-in, invitation and password
// pages (outside the app shell).
import type { ReactNode, SubmitEvent } from "react";

interface AuthCardProps {
  title: string;
  intro?: ReactNode;
  error?: string | null;
  onSubmit?: (event: SubmitEvent<HTMLFormElement>) => void;
  children: ReactNode;
}

export function AuthCard({ title, intro, error, onSubmit, children }: AuthCardProps) {
  const body = (
    <>
      <div className="flex flex-col gap-1">
        <img src="/icon.svg" alt="" className="mb-2 size-10" />
        <h1 id="auth-title" className="text-lg font-semibold">
          {title}
        </h1>
        {intro ? <p className="text-muted">{intro}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="rounded-sm bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
          {error}
        </p>
      ) : null}
      {children}
    </>
  );
  const cardClass = "flex w-full max-w-md flex-col gap-4 rounded-md border border-line bg-bg p-6 shadow-sm";
  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-4">
      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate className={cardClass} aria-labelledby="auth-title">
          {body}
        </form>
      ) : (
        <section className={cardClass} aria-labelledby="auth-title">
          {body}
        </section>
      )}
    </main>
  );
}
