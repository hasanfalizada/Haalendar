// +++===+++ 2026-10-30 — Hasan Alizada — HAAL-119. The assignees in the card editor (FR-KAN-10, D-97): every member of the
// board as a toggle, the user first ("Me"); written with the editor's Save. Hidden on a board nobody else shares unless
// someone is assigned already.
import { useTranslation } from "react-i18next";

import type { BoardMember } from "@/api/boards";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface CardAssigneesProps {
  me: string;
  members: readonly BoardMember[];
  /** The user ids chosen for the card. */
  chosen: string[];
  onChange: (next: string[]) => void;
}

/** The members with the user first. */
function meFirst(members: readonly BoardMember[], me: string): BoardMember[] {
  return [...members.filter((m) => m.user_id === me), ...members.filter((m) => m.user_id !== me)];
}

export function CardAssignees({ me, members, chosen, onChange }: CardAssigneesProps) {
  const { t } = useTranslation();
  if (members.length <= 1 && chosen.length === 0) return null;

  return (
    <section aria-labelledby="card-assignees" className="flex flex-col gap-2">
      <h3 id="card-assignees" className="text-[13px] font-medium">
        {t("kanban.assignees.title")}
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {meFirst(members, me).map((member) => {
          const on = chosen.includes(member.user_id);
          const name =
            member.user_id === me ? t("kanban.assignees.me", { name: member.display_name }) : member.display_name;
          return (
            <li key={member.user_id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onChange(on ? chosen.filter((id) => id !== member.user_id) : [...chosen, member.user_id]);
                }}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[13px] pointer-fine:md:h-8",
                  on ? "border-primary bg-primary-tint text-primary" : "border-line text-fg hover:bg-surface",
                  "disabled:opacity-60",
                )}
              >
                <Avatar name={member.display_name} url={null} size={24} />
                {name}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The initials of a card's assignees on its tile: three, then "+n". */
export function AssigneeFaces({ names }: { names: readonly string[] }) {
  const { t } = useTranslation();
  if (names.length === 0) return null;
  const shown = names.slice(0, 3);
  return (
    <span
      role="img"
      aria-label={t("kanban.assignees.on", { names: names.join(", ") })}
      className="ml-auto inline-flex items-center -space-x-1"
    >
      {shown.map((name, index) => (
        <Avatar key={`${name}-${String(index)}`} name={name} url={null} size={22} className="ring-2 ring-bg" />
      ))}
      {names.length > 3 ? (
        <span className="ml-2.5 text-[11px] text-muted tabular-nums" aria-hidden>
          +{names.length - 3}
        </span>
      ) : null}
    </span>
  );
}
