// +++===+++ 2026-11-20 10:45 +04 — Hasan Alizada — HAAL-190 (D-116). Saving by key: Ctrl/Cmd+S as well as
// Ctrl/Cmd+Enter; the browser's "Save page as" never opens while an editor is open; the editor holding the focus saves.
import { fireEvent, render } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useUnsavedGuard } from "./useUnsavedGuard";

function Editor({ name, dirty, onSave }: { name: string; dirty: boolean; onSave: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  useUnsavedGuard({ dirty, scope: form, onSave });
  return (
    <form ref={form}>
      <input aria-label={name} />
    </form>
  );
}

const ctrlS = { code: "KeyS", key: "s", ctrlKey: true };
const cmdS = { code: "KeyS", key: "s", metaKey: true };
const ctrlEnter = { code: "Enter", key: "Enter", ctrlKey: true };
// fireEvent returns false when the key was taken (preventDefault): the browser does nothing with it.
const taken = (target: Element, init: KeyboardEventInit) => !fireEvent.keyDown(target, init);

describe("saving an editor by key", () => {
  it("Ctrl+S, Cmd+S and Ctrl+Enter save the editor with changes", () => {
    const onSave = vi.fn();
    const view = render(<Editor name="title" dirty onSave={onSave} />);
    const field = view.getByLabelText("title");
    field.focus();
    expect(taken(field, ctrlS)).toBe(true);
    expect(taken(field, cmdS)).toBe(true);
    expect(taken(field, ctrlEnter)).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(3);
    view.unmount();
  });

  it("without changes Ctrl+S does nothing, and the browser does not get it", () => {
    const onSave = vi.fn();
    const view = render(<Editor name="title" dirty={false} onSave={onSave} />);
    const field = view.getByLabelText("title");
    field.focus();
    expect(taken(field, ctrlS)).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    view.unmount();
  });

  it("with several editors the one holding the focus saves; with the focus in none Ctrl+S is still taken", () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(
      <>
        <Editor name="first" dirty onSave={first} />
        <Editor name="second" dirty onSave={second} />
      </>,
    );
    const field = view.getByLabelText("first");
    field.focus();
    expect(taken(field, ctrlS)).toBe(true);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    field.blur();
    expect(taken(document.body, ctrlS)).toBe(true);
    expect(taken(document.body, ctrlEnter)).toBe(false); // Ctrl+Enter outside the editors stays the page's
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    view.unmount();
  });

  it("with no editor open Ctrl+S is the browser's again", () => {
    const view = render(<Editor name="title" dirty onSave={vi.fn()} />);
    view.unmount();
    expect(taken(document.body, ctrlS)).toBe(false);
  });
});
