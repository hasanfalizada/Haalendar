// +++===+++ 2026-10-29 — Hasan Alizada — HAAL-094. The calendar list (FR-CAL-32, D-82) in the desktop sidebar: own
// calendars with the default marked (no Archive / Delete for it), shared ones, the archived group; events of hidden and
// archived calendars leave the views; hiding saves the setting; new, edit, make default, archive and delete go through
// the outbox, delete after a confirmation naming the events, with Undo; leaving a shared calendar.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDb } from "@/sync/db";

import { json, me, renderApp, settings, stubApi } from "./fake-api";
import { stubMatchMedia } from "./setup";

const USER = me().id;
const DAY = "2026-11-10";
const MINE = "0199f000-0000-7000-8000-0000000000c1";
const WORK = "0199f000-0000-7000-8000-0000000000c2";
const OLD = "0199f000-0000-7000-8000-0000000000c3";
const BOBS = "0199f000-0000-7000-8000-0000000000c4";

const calendar = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  color: "blue",
  owner_id: USER,
  is_default: false,
  archived_at: null,
  deleted_at: null,
  version: 2,
  ...extra,
});

const event = (id: string, title: string, container: string) => ({
  id,
  kind: "event",
  container_kind: "calendar",
  container_id: container,
  title,
  color: "green",
  priority: "medium",
  all_day: true,
  start_date: DAY,
  end_date: DAY,
  start_time: null,
  end_time: null,
  tzid: me().time_zone,
  rrule: null,
  location: null,
  body: null,
  deleted_at: null,
  version: 1,
});

beforeEach(() => {
  // Desktop: the sidebar with the list is on the page.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const min = /min-width:\s*(\d+)px/.exec(query);
      return {
        matches: min ? 1280 >= Number(min[1]) : false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }),
  );
});

afterEach(() => {
  stubMatchMedia(false);
});

async function outbox() {
  const db = await localDb(USER);
  return db.outbox.orderBy("seq").toArray();
}

async function open(extra: Parameters<typeof stubApi>[0] = {}, hidden: string[] = []) {
  const db = await localDb(USER);
  await db.calendars.bulkPut([
    calendar(MINE, "My calendar", { is_default: true }),
    calendar(WORK, "Work", { color: "red" }),
    calendar(OLD, "Old", { archived_at: "2026-01-01T00:00:00Z" }),
    calendar(BOBS, "Family", { owner_id: "someone-else" }),
  ]);
  await db.items.bulkPut([
    event("e1", "Dentist", MINE),
    event("e2", "Review", WORK),
    event("e3", "Forgotten", OLD),
    event("e4", "Birthday", BOBS),
  ]);
  const calls = stubApi({
    "GET /me": () => json(me()),
    "GET /me/settings": () => json(settings({ hidden_calendars: hidden })),
    "POST /sync/push": () => new Promise<Response>(() => undefined),
    ...extra,
  });
  renderApp(`/calendar?date=${DAY}`);
  const sidebar = await screen.findByRole("complementary", { name: "Calendar sidebar" });
  await within(sidebar).findByRole("checkbox", { name: "Show Family" }); // the list has loaded
  return { user: userEvent.setup(), db, calls, sidebar };
}

const menuOf = async (user: ReturnType<typeof userEvent.setup>, sidebar: HTMLElement, name: string) => {
  await user.click(within(sidebar).getByRole("button", { name: `Options for ${name}` }));
  return screen.findByRole("menu");
};

describe("calendar list", { timeout: 15_000 }, () => {
  it("lists own, shared and archived calendars; hidden and archived ones leave the views", async () => {
    const { sidebar, user } = await open({}, [WORK]);
    const own = within(sidebar).getByRole("region", { name: "My calendars" });
    expect(own).toHaveTextContent("My calendar(default)");
    expect(within(own).getByRole("checkbox", { name: "Show My calendar" })).toBeChecked();
    expect(within(own).getByRole("checkbox", { name: "Show Work" })).not.toBeChecked();
    expect(within(sidebar).getByRole("region", { name: "Shared with me" })).toHaveTextContent("Family");
    expect(within(sidebar).getByText("Archived (1)")).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Details of Birthday" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Details of Review" })).not.toBeInTheDocument(); // hidden
    expect(screen.queryByRole("button", { name: "Details of Forgotten" })).not.toBeInTheDocument(); // archived

    const menu = await menuOf(user, sidebar, "My calendar");
    const items = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual(["Edit name and color…", "Share…"]); // the default: no default, archive or delete
  });

  it("hiding saves the setting and the events go", async () => {
    let saved: unknown = null;
    const { sidebar, user } = await open({
      "PATCH /me/settings": (call) => {
        saved = call.body;
        return json(settings({ hidden_calendars: [MINE], version: 2 }));
      },
    });
    expect(await screen.findByRole("button", { name: "Details of Dentist" })).toBeInTheDocument();
    await user.click(within(sidebar).getByRole("checkbox", { name: "Show My calendar" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Dentist" })).not.toBeInTheDocument();
    });
    expect(saved).toEqual({ hidden_calendars: [MINE] });
    expect(within(sidebar).getByRole("checkbox", { name: "Show My calendar" })).not.toBeChecked();
  });

  it("new, edit, make default and archive go through the outbox", async () => {
    const { sidebar, user, db } = await open();
    await user.click(within(sidebar).getByRole("button", { name: "New calendar" }));
    let dialog = await screen.findByRole("dialog", { name: "New calendar" });
    await user.type(within(dialog).getByLabelText("Name"), "Gym");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    await screen.findByText("Calendar created: Gym");

    await user.click(
      within(await menuOf(user, sidebar, "Work")).getByRole("menuitem", { name: "Edit name and color…" }),
    );
    dialog = await screen.findByRole("dialog", { name: "Edit calendar" });
    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Office");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved Work");

    await user.click(within(await menuOf(user, sidebar, "Office")).getByRole("menuitem", { name: "Make default" }));
    await screen.findByText("Office is now the default calendar");
    expect(await db.calendars.get(MINE)).toMatchObject({ is_default: false });

    await user.click(within(await menuOf(user, sidebar, "My calendar")).getByRole("menuitem", { name: "Archive" }));
    await screen.findByText("Archived My calendar");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Details of Dentist" })).not.toBeInTheDocument();
    });

    const ops = (await outbox()).map((entry) => [entry.entity_id, entry.op, entry.data]);
    expect(ops[0]).toMatchObject([expect.any(String), "create", { name: "Gym", color: "blue" }]);
    // The edit and the default merged into one waiting update of Work; then the archive of My calendar.
    expect(ops.slice(1)).toMatchObject([
      [WORK, "update", { name: "Office", is_default: true }],
      [MINE, "update", {}],
    ]);
    expect(typeof (await outbox())[2]?.data?.archived_at).toBe("string");
  });

  it("delete asks with the number of events and can be undone", async () => {
    const { sidebar, user } = await open();
    await user.click(within(await menuOf(user, sidebar, "Work")).getByRole("menuitem", { name: "Delete…" }));
    const ask = await screen.findByRole("dialog", { name: "Delete calendar?" });
    expect(ask).toHaveTextContent("Delete “Work”? Its 1 event goes to the trash with it.");
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    const toast = await screen.findByText("Deleted Work");
    expect(await outbox()).toMatchObject([{ entity_type: "calendar", entity_id: WORK, op: "delete", base_version: 2 }]);
    await user.click(within(toast.closest("li") ?? document.body).getByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      expect(await outbox()).toEqual([]); // delete and restore cancel out
    });
  });

  it("leaves a calendar shared with the user", async () => {
    let left = false;
    const share = {
      id: "0199f000-0000-7000-8000-0000000000s1",
      container_kind: "calendar",
      container_id: BOBS,
      container_name: "Family",
      grantee_id: USER,
      grantee_name: "Ada",
      grantee_email: "ada@example.org",
      owner_id: "someone-else",
      owner_name: "Bob",
      permission: "view",
      granted_by: "someone-else",
      created_at: "2026-10-01T00:00:00Z",
      revoked_at: null,
      version: 1,
    };
    const { sidebar, user } = await open({
      "GET /shares": () => json({ data: [share] }),
      "DELETE /shares/*": () => {
        left = true;
        return new Response(null, { status: 204 });
      },
    });
    const shared = within(sidebar).getByRole("region", { name: "Shared with me" });
    await waitFor(() => {
      expect(within(shared).getByTitle("Shared by Bob")).toBeInTheDocument();
    });
    await user.click(within(await menuOf(user, sidebar, "Family")).getByRole("menuitem", { name: "Leave" }));
    await screen.findByText("You left “Family”.");
    expect(left).toBe(true);
  });
});
