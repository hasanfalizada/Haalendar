// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-034. Guard for FR-X-05 ("failures are never silent"): every module that
// calls a write of the generated client (POST/PUT/PATCH/DELETE) must report it through runWrite. Exceptions are listed
// with their reason; a new request helper under src/api must be registered so its callers are checked too.
// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo handler modules (registerUndo) are covered: lib/undo runs their
// requests through runWrite.
import { describe, expect, it } from "vitest";

// Sources as text through Vite (the app's TypeScript config has no Node types).
const SOURCES = import.meta.glob<string>(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}", "!/src/test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Full-page flows outside the app shell: the page itself is the result (card error or "done" state). */
const PAGE_RESULT: Record<string, string> = {
  "routes/login.tsx": "sign-in page",
  "routes/register.tsx": "sign-up page",
  "routes/setup.tsx": "first-run setup page",
  "routes/invite.tsx": "invitation page",
  "routes/change-password.tsx": "forced password change page",
  "routes/forgot-password.tsx": "password reset request page",
  "routes/reset-password.tsx": "password reset page",
  "routes/verify-email.tsx": "e-mail confirmation page",
  "components/auth/ResendVerification.tsx": "part of the sign-up / confirmation pages",
  "components/auth/ReauthProvider.tsx":
    "the re-authentication dialog shows its own result; the action it guards uses runWrite",
};

/** Request helpers under src/api and the exported functions that perform writes (their callers must use runWrite). */
const REQUEST_HELPERS: Record<string, string[]> = {
  "api/profile.ts": ["uploadAvatarFile"],
  // logout: signing out always ends on the sign-in page.
  "api/session.ts": [],
};

function writeFunctions(): Set<string> {
  const sdk = SOURCES["/src/api/generated/sdk.gen.ts"] ?? "";
  const names = [
    ...sdk.matchAll(/^export const (\w+) = .*\(options\??\.client \?\? client\)\.(post|put|patch|delete)</gm),
  ];
  return new Set(names.map((m) => m[1] as string));
}

function importedNames(text: string, fromPattern: RegExp): string[] {
  return [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)]
    .filter((m) => fromPattern.test(m[2] as string))
    .flatMap((m) => (m[1] as string).split(",").map((part) => part.replace(/^\s*type\s+/, "").trim()))
    .filter(Boolean);
}

describe("write coverage", () => {
  const writes = writeFunctions();
  const files = Object.entries(SOURCES)
    .filter(([path]) => !path.includes("/generated/") && !path.endsWith(".gen.ts"))
    .map(([path, text]) => ({ rel: path.replace(/^\/src\//, ""), text }));

  it("finds the writes of the generated client", () => {
    expect(writes.has("updateProfile")).toBe(true);
    expect(writes.has("restoreFromTrash")).toBe(true);
    expect(writes.has("removeAvatar")).toBe(true); // a write without required options
    expect(writes.has("getMe")).toBe(false);
  });

  it("every request helper under src/api is registered", () => {
    const helpers = files
      .filter((f) => f.rel.startsWith("api/") && f.rel !== "api/write.ts")
      .filter((f) => importedNames(f.text, /generated\/sdk\.gen$/).some((n) => writes.has(n)))
      .map((f) => f.rel);
    expect(helpers.sort()).toEqual(Object.keys(REQUEST_HELPERS).sort());
  });

  const helperNames = new Set(Object.values(REQUEST_HELPERS).flat());
  function bypassesRunWrite(text: string): boolean {
    const used = [
      ...importedNames(text, /generated\/sdk\.gen$/).filter((n) => writes.has(n)),
      ...importedNames(text, /^@\/api\//).filter((n) => helperNames.has(n)),
    ];
    const covered =
      importedNames(text, /^@\/api\/write$/).includes("runWrite") ||
      importedNames(text, /^@\/lib\/undo$/).includes("registerUndo");
    return used.length > 0 && !covered;
  }

  it("recognises a module that writes without runWrite", () => {
    expect(bypassesRunWrite('import { updateProfile } from "@/api/generated/sdk.gen";')).toBe(true);
    expect(bypassesRunWrite('import { uploadAvatarFile } from "@/api/profile";')).toBe(true);
    expect(
      bypassesRunWrite(
        'import { updateProfile } from "@/api/generated/sdk.gen";\nimport { runWrite } from "@/api/write";',
      ),
    ).toBe(false);
    expect(bypassesRunWrite('import { listTrash } from "@/api/generated/sdk.gen";')).toBe(false);
  });

  it("every UI module that writes reports through runWrite", () => {
    const offenders = files
      .filter((f) => !f.rel.startsWith("api/") && !(f.rel in PAGE_RESULT))
      .filter((f) => bypassesRunWrite(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("the listed exceptions still exist", () => {
    const present = new Set(files.map((f) => f.rel));
    expect(Object.keys(PAGE_RESULT).filter((rel) => !present.has(rel))).toEqual([]);
  });
});
