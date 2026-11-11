// +++===+++ 2026-10-16 — Hasan Alizada — HAAL-035. Undo / redo for sharing (D-40): giving access, changing the
// permission and removing access. Revocation is soft and sharing again creates a new share row, so undoing a removal
// shares again and the payload follows the new id. Leaving a share (as the grantee) cannot be undone: only the owner
// can share again. Registered at start-up (App.tsx) so steps restored after a reload find their handlers.
import { createShare, revokeShare, updateShare } from "@/api/generated/sdk.gen";
import type { ContainerKind, Permission, Share } from "@/api/generated/types.gen";
import { registerUndo } from "@/lib/undo";

export interface ShareAccess {
  id: string;
  container_kind: ContainerKind;
  container_id: string;
  email: string;
  permission: Permission;
}

export interface PermissionChange {
  id: string;
  from: Permission;
  to: Permission;
  version: number;
}

export function accessOf(share: Share): ShareAccess {
  return {
    id: share.id,
    container_kind: share.container_kind,
    container_id: share.container_id,
    email: share.grantee_email,
    permission: share.permission,
  };
}

function grant(access: ShareAccess) {
  return {
    run: () =>
      createShare({
        body: {
          container_kind: access.container_kind,
          container_id: access.container_id,
          grantee_email: access.email,
          permission: access.permission,
        },
      }),
    next: (data: unknown, payload: ShareAccess): ShareAccess => ({ ...payload, id: (data as Share).id }),
  };
}

function remove(access: ShareAccess) {
  return { run: () => revokeShare({ path: { id: access.id } }) };
}

function setPermission(change: PermissionChange, permission: Permission) {
  return {
    run: () =>
      updateShare({
        path: { id: change.id },
        headers: { "If-Match": `"${String(change.version)}"` },
        body: { permission },
      }),
    next: (data: unknown, payload: PermissionChange): PermissionChange => ({
      ...payload,
      version: (data as Share).version,
    }),
  };
}

registerUndo<ShareAccess>("share.create", { undo: remove, redo: grant });
registerUndo<ShareAccess>("share.revoke", { undo: grant, redo: remove });
registerUndo<PermissionChange>("share.permission", {
  undo: (change) => setPermission(change, change.from),
  redo: (change) => setPermission(change, change.to),
});
