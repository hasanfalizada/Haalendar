// The page asks search engines not to list it (HAAL-176, D-105); the server says the same in X-Robots-Tag
// (backend/tests/test_web_app.py), and scripts/dev/compose-check.sh checks both in the built image.
import { describe, expect, it } from "vitest";

import page from "../../index.html?raw";

describe("the page of the app", () => {
  it("is not offered to search engines", () => {
    const head = new DOMParser().parseFromString(page, "text/html").head;
    expect(head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
  });
});
