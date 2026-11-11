// +++===+++ 2026-10-15 — Hasan Alizada — HAAL-165. Atom authz.check.v1 — TypeScript implementation (contract:
// atoms/authz.check.v1/contract.json). The web app uses it to hide actions the user may not perform; the server stays
// authoritative. Default deny; the actor role is ignored (admins have no content access).

export type Action = "read" | "write_items" | "manage_container" | "share";
export type SharePermission = "view" | "edit";
export type Reason = "owner" | "shared_edit" | "shared_view" | "not_shared" | "view_only" | "owner_only";

export interface Decision {
  allowed: boolean;
  deny_status: 403 | 404 | null;
  reason: Reason;
}

export function check(
  actorId: string,
  action: Action,
  ownerId: string,
  sharePermission: SharePermission | null,
): Decision {
  if (actorId === ownerId) return { allowed: true, deny_status: null, reason: "owner" };
  if (sharePermission === null) return { allowed: false, deny_status: 404, reason: "not_shared" };
  if (action === "manage_container" || action === "share") {
    return { allowed: false, deny_status: 403, reason: "owner_only" };
  }
  if (action === "read") {
    return { allowed: true, deny_status: null, reason: sharePermission === "edit" ? "shared_edit" : "shared_view" };
  }
  return sharePermission === "edit"
    ? { allowed: true, deny_status: null, reason: "shared_edit" }
    : { allowed: false, deny_status: 403, reason: "view_only" };
}
