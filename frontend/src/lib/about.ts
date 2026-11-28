// +++===+++ 2026-10-19 — Hasan Alizada — HAAL-044. Project facts for Help and About (FR-X-15, legacy F-34): version of
// this build (from package.json at build time), licence and the author's and repository links. Fixed in the code on
// purpose: they are the project's attribution, not instance settings.
export const APP_VERSION: string = __APP_VERSION__;
export const LICENSE_NAME = "Apache-2.0";

// +++===+++ 2026-11-10 — Hasan Alizada — The author's website moved to its own domain (the old address redirects there).
export const AUTHOR_URL = "https://hasanalizada.net/";
export const REPOSITORY_URL = "https://github.com/hasanfalizada/Haalendar";
export const LICENSE_URL = `${REPOSITORY_URL}/blob/master/LICENSE`;
// +++===+++ 2026-11-26 23:58 +04 — Hasan Alizada — HAAL-153 (D-129). Help → Documentation opens the user guide (it led to
// the development documentation); master holds the guide of the latest release. backend/tests/test_user_guide.py checks
// that the page exists.
export const DOCS_URL = `${REPOSITORY_URL}/blob/master/docs/guide/user/README.md`;
export const ISSUES_URL = `${REPOSITORY_URL}/issues`;
// +++===+++ 2026-11-17 19:52 +04 — Hasan Alizada — HAAL-183. What the public demo keeps about a visitor and its terms,
// linked from the demo banner; the demo runs a release, so the guide on master matches it.
export const DEMO_TERMS_URL = `${REPOSITORY_URL}/blob/master/docs/operations/demo.md#privacy`;
