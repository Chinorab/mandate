import { StateIcon, type IconName } from "./icons";
import s from "./ui.module.css";

/**
 * Every state shows an icon and a label, never color alone (System board, "States").
 */
export type TagState =
  | "compliant"
  | "blocked"
  | "dispute"
  | "resolved"
  | "awaiting"
  | "active"
  | "expired"
  | "revoked";

const LOOK: Record<TagState, { tone: string; icon: IconName; label: string }> = {
  compliant: { tone: s.compliant, icon: "compliant", label: "Compliant" },
  blocked: { tone: s.blocked, icon: "blocked", label: "Blocked" },
  dispute: { tone: s.dispute, icon: "dispute", label: "In dispute" },
  resolved: { tone: s.resolved, icon: "resolved", label: "Resolved" },
  awaiting: { tone: s.awaiting, icon: "awaiting", label: "Awaiting you" },
  active: { tone: s.compliant, icon: "active", label: "Active" },
  expired: { tone: s.neutral, icon: "expired", label: "Expired" },
  revoked: { tone: s.neutral, icon: "revoked", label: "Revoked" },
};

export function Tag({ state, children }: { state: TagState; children?: React.ReactNode }) {
  const look = LOOK[state];
  return (
    <span className={`${s.tag} ${look.tone}`}>
      <StateIcon name={look.icon} size={15} weight="bold" />
      {children ?? look.label}
    </span>
  );
}
