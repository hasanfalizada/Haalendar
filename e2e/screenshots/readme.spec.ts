// +++===+++ 2026-11-08 — Hasan Alizada — HAAL-152. Fills an empty stack with made-up data through the API and takes the
// screenshots of the README into docs/screenshots. Dates are relative to the current week, so a new run stays plausible.
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots");
const API = "/api/v1";
const ZONE = "Europe/Berlin";
let nextPosition = 0;
/** Fractional indexes in the order of the calls. */
const position = (): string => `a${String(nextPosition++).padStart(3, "0")}`;

const now = new Date();
/** Monday of the current week: the browser's clock stands at 08:30 that day, so nothing is overdue by accident. */
const MONDAY = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)));
const CLOCK = new Date(`${MONDAY.toISOString().slice(0, 10)}T07:30:00Z`);

/** The ISO date some days after that Monday. */
function weekday(days: number): string {
  return new Date(MONDAY.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Through the page's own fetch: the session cookie is Secure, which only the browser sends to http://localhost. */
async function call<T>(page: Page, method: string, path: string, csrf: string, data?: unknown): Promise<T> {
  const answer = await page.evaluate(
    async ({ method, url, csrf, data }) => {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return { status: response.status, text: await response.text() };
    },
    { method, url: `${API}${path}`, csrf, data },
  );
  expect(answer.status, `${method} ${path}: ${answer.text}`).toBeLessThan(300);
  return JSON.parse(answer.text) as T;
}

type Entity = "item" | "checklist_item" | "board" | "board_column" | "label" | "item_label";

/** Everything the app writes goes through the sync push, as here. */
class Seed {
  private readonly mutations: unknown[] = [];

  add(entity_type: Entity, data: Record<string, unknown>): string {
    const entity_id = randomUUID();
    this.mutations.push({ mutation_id: randomUUID(), entity_type, entity_id, op: "create", data });
    return entity_id;
  }

  async push(page: Page, csrf: string): Promise<void> {
    const answer = await call<{ results: { status: string; problem?: unknown }[] }>(page, "POST", "/sync/push", csrf, {
      mutations: this.mutations,
    });
    expect(answer.results.filter((result) => result.status !== "applied")).toEqual([]);
  }
}

async function seed(page: Page): Promise<string> {
  const { csrf_token: csrf } = await call<{ csrf_token: string }>(page, "GET", "/me", "");
  const pulled = await call<{ changes: { entity_type: string; entity_id: string }[] }>(page, "GET", "/sync/pull", csrf);
  const calendar = pulled.changes.find((change) => change.entity_type === "calendar")?.entity_id;
  expect(calendar, "the default calendar").toBeTruthy();
  const data = new Seed();

  const event = (fields: Record<string, unknown>) =>
    data.add("item", { kind: "event", container_kind: "calendar", container_id: calendar, tzid: ZONE, ...fields });
  const timed = (title: string, day: number, start: string, end: string, color: string, more = {}) =>
    event({
      title,
      color,
      all_day: false,
      start_date: weekday(day),
      start_time: start,
      end_date: weekday(day),
      end_time: end,
      ...more,
    });
  timed("Team stand-up", 0, "09:00", "09:30", "blue", { rrule: "FREQ=WEEKLY;BYDAY=MO,WE,FR" });
  timed("Design review", 0, "11:00", "12:30", "purple");
  timed("Lunch with Mira", 1, "12:30", "13:30", "green");
  timed("Sprint planning", 1, "14:00", "16:00", "orange", { priority: "high" });
  timed("Dentist", 2, "16:00", "17:00", "red");
  timed("Customer call", 3, "10:00", "11:00", "blue");
  timed("Write release notes", 3, "13:00", "15:00", "brown");
  timed("Yoga", 1, "18:00", "19:00", "green", { rrule: "FREQ=WEEKLY;BYDAY=TU,FR" });
  event({ title: "Team offsite", color: "yellow", all_day: true, start_date: weekday(3), end_date: weekday(4) });

  const note = (title: string, color: string, body: string, more = {}) =>
    data.add("item", { kind: "note", container_kind: "note", title, color, body, position: position(), ...more });
  note("Book list", "purple", "**Next up:** *The Dispossessed*\n\nThen something short.");
  note("Trip to Lisbon", "blue", "Flights booked. Still to do:\n\n1. Hotel\n2. Tram tickets");
  note("Wi-Fi at the cabin", "yellow", "Ask the owner for the guest network.");
  note("Gift ideas", "orange", "A good pair of hiking socks, a plant, a board game.");
  note("Meeting notes", "brown", "Move the release to the second week.\n\n> Keep the scope small.");
  const groceries = note("Groceries", "green", "", { pinned: true, is_checklist: true });
  for (const [text, checked] of [
    ["Oat milk", true],
    ["Coffee beans", true],
    ["Lemons", false],
    ["Olive oil", false],
  ] as const) {
    data.add("checklist_item", { item_id: groceries, text, checked, position: position() });
  }

  const board = data.add("board", { name: "Website launch", position: position() });
  const column = (name: string, wip_limit: number | null = null) =>
    data.add("board_column", { board_id: board, name, wip_limit, position: position() });
  const todo = column("To do");
  const doing = column("In progress", 3);
  const done = column("Done");
  const label = (name: string, color: string) => data.add("label", { board_id: board, name, color });
  const design = label("Design", "purple");
  const content = label("Content", "blue");
  const card = (column_id: string, title: string, priority: string, due: number | null, labelId?: string) => {
    const item_id = data.add("item", {
      kind: "card",
      container_kind: "board",
      container_id: board,
      column_id,
      title,
      priority,
      position: position(),
      ...(due === null ? {} : { due_date: weekday(due) }),
    });
    if (labelId) data.add("item_label", { item_id, label_id: labelId });
  };
  card(todo, "Write the landing page copy", "high", 3, content);
  card(todo, "Collect customer quotes", "medium", null, content);
  card(todo, "Choose the pricing table layout", "low", 6, design);
  card(doing, "Design the hero section", "high", -1, design);
  card(doing, "Set up analytics", "medium", 1);
  card(done, "Register the domain", "medium", null);
  card(done, "Pick the brand colours", "low", null, design);

  await data.push(page, csrf);
  return board;
}

test("screenshots of the README", async ({ page, browser }) => {
  await page.clock.setFixedTime(CLOCK);
  await page.goto("/calendar");
  const board = await seed(page);
  const shot = (name: string, target: Page = page) => target.screenshot({ path: resolve(OUT, `${name}.png`) });

  await page.goto(`/calendar?view=week&date=${weekday(0)}`);
  await expect(page.getByText("Sprint planning").first()).toBeVisible();
  await shot("calendar-week");

  await page.goto("/todo");
  await expect(page.getByText("Groceries").first()).toBeVisible();
  await shot("todo");

  await page.goto(`/kanban/${board}`);
  await expect(page.getByText("Design the hero section").first()).toBeVisible();
  await shot("kanban");

  // Set before the page loads: otherwise the colours are caught in their transition.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/calendar?view=month&date=${weekday(0)}`);
  await expect(page.getByText("Sprint planning").first()).toBeVisible();
  await shot("calendar-month-dark");

  const phone = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: ".auth/admin.json",
    locale: "en-US",
    timezoneId: ZONE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  await phone.clock.setFixedTime(CLOCK);
  const mobile = await phone.newPage();
  await mobile.goto(`/calendar?view=day&date=${weekday(1)}`);
  await expect(mobile.getByText("Sprint planning").first()).toBeVisible();
  await shot("calendar-phone", mobile);
  await phone.close();
});
