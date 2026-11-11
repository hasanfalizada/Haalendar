// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. runWrite: exactly one notification per write — success, failure
// with a human-readable reason (no connection, no answer, conflict, invalid fields, server error with reference,
// session expired with "Sign in"), Retry, inline mode for dialogs, cancelled re-authentication, the tab-close guard;
// notify.queued / notify.synced for the offline outbox.
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { REAUTH_CANCELLED } from "@/components/auth/reauth";
import { notify } from "@/lib/notify";
import { renderWithProviders } from "@/test/fake-api";

import type { Problem } from "./generated/types.gen";
import { installUnloadGuard, pendingWrites, runWrite, setSessionExpiredHandler } from "./write";

function problem(status: number, code: Problem["code"], extra: Partial<Problem> = {}) {
  return {
    error: { type: "about:blank", title: code, status, code, ...extra } satisfies Problem,
    response: new Response(null, { status }),
  };
}

function toasts() {
  return document.querySelectorAll("[data-sonner-toast]");
}

describe("runWrite", () => {
  afterEach(() => {
    setSessionExpiredHandler(null);
  });

  it("reports a success once and hands over the data", async () => {
    renderWithProviders(<div />);
    const onSuccess = vi.fn();
    const result = await runWrite({
      name: "thing_save",
      run: () => Promise.resolve({ data: { id: 7 } }),
      success: (data) => `Saved ${String(data.id)}.`,
      onSuccess,
    });
    expect(result).toEqual({ ok: true, data: { id: 7 } });
    expect(onSuccess).toHaveBeenCalledWith({ id: 7 });
    expect(await screen.findByText("Saved 7.")).toBeInTheDocument();
    expect(toasts()).toHaveLength(1);
  });

  it("says when the server cannot be reached and retries on request", async () => {
    renderWithProviders(<div />);
    const run = vi
      .fn<() => Promise<{ data?: string }>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ data: "ok" });
    const onSuccess = vi.fn();
    const result = await runWrite({ name: "note_save", run, success: "Saved.", onSuccess, draft: true });

    expect(result).toMatchObject({ ok: false, code: "network" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not saved — the server cannot be reached.");
    expect(alert).toHaveTextContent("Your text is kept on this device.");
    expect(onSuccess).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledWith("ok");
  });

  it("explains a conflict without offering a pointless retry", async () => {
    renderWithProviders(<div />);
    const result = await runWrite({
      name: "thing_save",
      run: () => Promise.resolve(problem(409, "version_conflict")),
      success: "Saved.",
    });
    expect(result).toMatchObject({ ok: false, code: "version_conflict" });
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere in the meantime");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows a server error with a short request reference and Retry", async () => {
    renderWithProviders(<div />);
    await runWrite({
      name: "thing_save",
      run: () => Promise.resolve(problem(500, "internal_error", { request_id: "abcdef1234567890" })),
      success: "Saved.",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("the server ran into an error");
    expect(screen.getByText("Reference: abcdef12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("passes field errors to the form and points at them", async () => {
    renderWithProviders(<div />);
    const onFieldErrors = vi.fn();
    await runWrite({
      name: "thing_save",
      run: () =>
        Promise.resolve(
          problem(422, "validation_failed", { errors: [{ pointer: "/title", detail: "Too long", code: "max" }] }),
        ),
      success: "Saved.",
      onFieldErrors,
    });
    expect(onFieldErrors).toHaveBeenCalledWith([{ field: "title", detail: "Too long", code: "max" }]);
    expect(await screen.findByRole("alert")).toHaveTextContent("check the highlighted fields");
  });

  it("uses a caller's reason for a particular code", async () => {
    renderWithProviders(<div />);
    await runWrite({
      name: "admin_role_change",
      run: () => Promise.resolve(problem(409, "invalid_state")),
      success: "Done.",
      reasons: (p) => (p.code === "invalid_state" ? "At least one administrator must remain." : null),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("At least one administrator must remain.");
  });

  it("reports a write that does not answer in time", async () => {
    renderWithProviders(<div />);
    const result = await runWrite({
      name: "thing_save",
      run: () => new Promise(() => undefined),
      success: "Saved.",
      timeoutMs: 20,
    });
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(await screen.findByRole("alert")).toHaveTextContent("No answer from the server.");
  });

  it("offers to sign in when the session has expired", async () => {
    renderWithProviders(<div />);
    const signIn = vi.fn();
    setSessionExpiredHandler(signIn);
    await runWrite({ name: "thing_save", run: () => Promise.resolve(problem(401, "session_expired")), success: "" });
    expect(await screen.findByRole("alert")).toHaveTextContent("your session has expired");
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("returns the reason instead of a toast in inline mode", async () => {
    renderWithProviders(<div />);
    const result = await runWrite({
      name: "invite",
      run: () => Promise.reject(new TypeError("Failed to fetch")),
      success: "Sent.",
      failure: "inline",
    });
    expect(result).toMatchObject({ ok: false, code: "network" });
    expect(result.ok ? null : result.reason).toContain("cannot be reached");
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(toasts()).toHaveLength(0);
  });

  it("stays silent when the user cancels the re-authentication", async () => {
    renderWithProviders(<div />);
    const result = await runWrite({
      name: "admin_action",
      run: () => Promise.resolve({ error: REAUTH_CANCELLED }),
      success: "Done.",
    });
    expect(result).toMatchObject({ ok: false, code: "cancelled", reason: null });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(toasts()).toHaveLength(0);
  });

  it("reports a partial failure inside a successful answer as a failure", async () => {
    renderWithProviders(<div />);
    await runWrite({
      name: "trash_restore",
      run: () => Promise.resolve({ data: { restored: 1, failed: 1 } }),
      success: () => ({ failure: "1 restored. 1 could not be restored." }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("1 restored. 1 could not be restored.");
  });

  it("asks before the tab closes while a write is in flight", async () => {
    const remove = installUnloadGuard();
    let finish: (value: { data: string }) => void = () => undefined;
    const write = runWrite({
      name: "thing_save",
      run: () =>
        new Promise<{ data: string }>((resolve) => {
          finish = resolve;
        }),
      success: "Saved.",
    });
    expect(pendingWrites()).toBe(1);
    const busy = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(busy);
    expect(busy.defaultPrevented).toBe(true);

    finish({ data: "ok" });
    await write;
    expect(pendingWrites()).toBe(0);
    const idle = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(idle);
    expect(idle.defaultPrevented).toBe(false);
    remove();
  });
});

describe("offline notifications", () => {
  it("say that changes are queued on the device and later synced", async () => {
    renderWithProviders(<div />);
    act(() => {
      notify.queued(3);
      notify.synced(3);
    });
    expect(await screen.findByText(/3 changes saved on this device/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("3 changes synced.")).toBeInTheDocument();
    });
  });
});
