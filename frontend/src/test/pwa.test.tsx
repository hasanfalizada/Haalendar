// +++===+++ 2026-10-21 — Hasan Alizada — HAAL-051. PWA (FR-OFF-01/06, D-55): manifest and service-worker rules, the
// profile kept on the device for starting without the server, the offline banner, "Install app" while the browser
// allows it, and the update offered after a new version is downloaded.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isDeviceProfile, meQuery } from "@/api/session";
import { cachedProfile, forgetProfile, rememberProfile } from "@/lib/profileCache";
import { MANIFEST, NETWORK_ONLY_PATHS, PRECACHE_GLOBS } from "@/pwa-config";

import { json, me, problem, renderApp, stubApi } from "./fake-api";

describe("manifest and service worker rules", () => {
  it("describes an installable app with maskable icon and module shortcuts", () => {
    expect(MANIFEST).toMatchObject({ name: "Haalendar", display: "standalone", start_url: "/calendar", scope: "/" });
    expect(MANIFEST.icons?.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512")).toBe(true);
    expect(MANIFEST.icons?.some((icon) => icon.sizes === "192x192")).toBe(true);
    expect(MANIFEST.shortcuts?.map((s) => s.url)).toEqual(["/calendar", "/todo", "/kanban"]);
  });

  it("caches the app shell only, never API answers or source maps", () => {
    const networkOnly = (path: string) => NETWORK_ONLY_PATHS.some((rule) => rule.test(path));
    for (const path of ["/api/v1/me", "/api/v1/notifications", "/metrics", "/health/live"]) {
      expect(networkOnly(path)).toBe(true);
    }
    for (const path of ["/calendar", "/settings", "/todo"]) expect(networkOnly(path)).toBe(false);
    expect(PRECACHE_GLOBS.join()).not.toContain("map");
  });
});

describe("profile on the device", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await forgetProfile();
  });

  it("is stored without the session token and forgotten on request", async () => {
    await rememberProfile(me({ csrf_token: "secret-token" }));
    const stored = await cachedProfile();
    expect(stored?.email).toBe(me().email);
    expect(stored).not.toHaveProperty("csrf_token");
    await forgetProfile();
    expect(await cachedProfile()).toBeNull();
  });

  it("stands in when the server cannot be reached, and only then", async () => {
    await rememberProfile(me());
    const run = meQuery.queryFn as () => Promise<unknown>;

    stubApi({ "GET /me": () => Promise.reject(new TypeError("Failed to fetch")) });
    const offline = await run();
    expect(offline).toMatchObject({ email: me().email });
    expect(isDeviceProfile(offline as never)).toBe(true);

    stubApi({ "GET /me": () => problem(503, "unavailable") });
    expect(await run()).toMatchObject({ email: me().email });

    stubApi({ "GET /me": () => problem(401, "session_expired") });
    expect(await run()).toBeNull(); // signed out: never the stored profile

    await forgetProfile();
    stubApi({ "GET /me": () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(run()).rejects.toThrow("server unreachable");
  });

  it("is written after every successful check of the session", async () => {
    stubApi({ "GET /me": () => json(me({ display_name: "Fresh Name" })) });
    const live = await (meQuery.queryFn as () => Promise<unknown>)();
    expect(isDeviceProfile(live as never)).toBe(false);
    await waitFor(async () => {
      expect((await cachedProfile())?.display_name).toBe("Fresh Name");
    });
  });

  it("lets the app start without the server and says so", async () => {
    await rememberProfile(me());
    stubApi({
      "GET /me": () => Promise.reject(new TypeError("Failed to fetch")),
      "GET /health/live": () => Promise.reject(new TypeError("Failed to fetch")),
    });
    renderApp("/calendar");
    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    // The health check retries once before it calls the server unreachable.
    expect(await screen.findByText(/The server cannot be reached/, undefined, { timeout: 5_000 })).toBeInTheDocument();
  });
});

describe("offline banner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("appears while the device has no network", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent("You are offline.");
  });

  it("is absent while the server answers", async () => {
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    await screen.findByRole("heading", { name: "Calendar", level: 1 });
    await waitFor(() => {
      expect(screen.queryByText(/You are offline|cannot be reached/)).not.toBeInTheDocument();
    });
  });
});

describe("install", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers Install app while the browser allows it", async () => {
    const { listenForInstall } = await import("@/lib/pwa");
    listenForInstall();
    stubApi({ "GET /me": () => json(me()) });
    renderApp("/calendar");
    const user = userEvent.setup();
    const menuButton = await screen.findByRole("button", { name: "Account menu of Ada Admin" });

    await user.click(menuButton);
    expect(within(await screen.findByRole("menu")).queryByRole("menuitem", { name: "Install app" })).toBeNull();
    await user.keyboard("{Escape}");

    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true); // offered from the menu, not as the browser's banner

    await user.click(menuButton);
    await user.click(await screen.findByRole("menuitem", { name: "Install app" }));
    expect(prompt).toHaveBeenCalledOnce();

    await user.click(menuButton);
    expect(within(await screen.findByRole("menu")).queryByRole("menuitem", { name: "Install app" })).toBeNull();
  });
});

describe("app update", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("workbox-window");
    vi.resetModules();
  });

  it("is offered after a new version is downloaded and applied on Reload", async () => {
    const handlers = new Map<string, () => void>();
    const workbox = {
      addEventListener: vi.fn((name: string, handler: () => void) => handlers.set(name, handler)),
      register: vi.fn(async () => undefined),
      messageSkipWaiting: vi.fn(),
    };
    vi.resetModules(); // lib/pwa was loaded by the tests above with the real workbox-window
    // A function (not an arrow) so that `new Workbox()` returns the stub.
    vi.doMock("workbox-window", () => ({
      Workbox: vi.fn(function Workbox() {
        return workbox;
      }),
    }));
    vi.stubEnv("PROD", true);
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true }); // jsdom has none
    const { registerServiceWorker } = await import("@/lib/pwa");
    const { renderWithProviders } = await import("./fake-api");
    renderWithProviders(<div />);

    registerServiceWorker();
    expect(workbox.register).toHaveBeenCalledOnce();
    act(() => {
      handlers.get("waiting")?.();
    });
    const reload = await screen.findByRole("button", { name: "Reload" });
    expect(screen.getByText("A new version of Haalendar is available.")).toBeInTheDocument();
    await userEvent.setup().click(reload);
    expect(workbox.messageSkipWaiting).toHaveBeenCalledOnce();
    Reflect.deleteProperty(navigator, "serviceWorker");
  });
});
