// +++===+++ 2026-11-11 — Hasan Alizada — HAAL-156. The version of the build wins over package.json (seen on the demo
// stand: the image 1.0.0-rc.4 showed "Version 0.1.0" in About); the whole way through the image is checked by
// scripts/dev/compose-check.sh.
import { describe, expect, it } from "vitest";

import { appVersion } from "@/app-version";

describe("the version shown in About", () => {
  it("is the version the image was built with", () => {
    expect(appVersion("1.0.0-rc.4", "1.0.0")).toBe("1.0.0-rc.4");
    expect(appVersion(" 1.2.3\n", "1.0.0")).toBe("1.2.3");
  });

  it("is the version of package.json when the build names none", () => {
    expect(appVersion(undefined, "1.0.0")).toBe("1.0.0");
    expect(appVersion("", "1.0.0")).toBe("1.0.0");
    expect(appVersion("  ", "1.0.0")).toBe("1.0.0");
  });
});
