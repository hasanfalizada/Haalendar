// +++===+++ 2026-11-11 — Hasan Alizada — HAAL-156. The version About shows. A release image is built with its version
// (Dockerfile: VERSION, set by CI from the tag) and the web app takes it as the server does; before, the web app knew
// only package.json, so the image 1.0.0-rc.4 showed "Version 0.1.0" in About while its server answered 1.0.0-rc.4.
// Built from the sources, without a version given, it is the version in package.json. Used by vite.config.ts.
export function appVersion(fromBuild: string | undefined, fromPackage: string): string {
  const given = fromBuild?.trim() ?? "";
  return given === "" ? fromPackage : given;
}
