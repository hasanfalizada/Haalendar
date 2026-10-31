// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-140. Every test watches the browser: an error or warning in the console,
// an uncaught exception or an API answer of 400 and above fails it, unless the test expects that answer
// (`watch.allow(/401 POST \/api\/v1\/auth\/login/)`). Other helpers shared by the scenarios live here too.
import { expect, test as base, type Page } from "@playwright/test";

export class Watch {
  readonly problems: string[] = [];
  private readonly allowed: RegExp[] = [];

  constructor(page: Page) {
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        this.problems.push(`console ${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => this.problems.push(`page error: ${error.message}`));
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/api/") && response.status() >= 400) {
        this.problems.push(`${response.status()} ${response.request().method()} ${url.pathname}`);
      }
    });
  }

  allow(pattern: RegExp): void {
    this.allowed.push(pattern);
  }

  unexpected(): string[] {
    // The browser reports a failed request in the console too; an allowed answer allows that line.
    const allowedStatus = this.problems.filter((p) => this.allowed.some((a) => a.test(p)));
    return this.problems.filter(
      (p) =>
        !this.allowed.some((a) => a.test(p)) &&
        !(p.includes("Failed to load resource") && allowedStatus.some((s) => p.includes(s.split(" ")[0] ?? ""))),
    );
  }
}

export const test = base.extend<{ watch: Watch }>({
  watch: [
    async ({ page }, use) => {
      const watch = new Watch(page);
      await use(watch);
      expect(watch.unexpected(), "browser console and API answers").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** A title nobody else in this run uses (the database lives for the whole run). */
export function unique(title: string): string {
  return `${title} ${Math.random().toString(36).slice(2, 7)}`;
}
