import type { ReactNode } from "react";
import { formatUsd } from "@/lib/pricing";
import s from "./ui.module.css";

/** Money is always tabular and comes from integer cents. */
export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={["num", className].filter(Boolean).join(" ")}>{formatUsd(cents)}</span>;
}

/** Identifiers and fingerprints in Geist Mono. Long hashes are shortened, with the full value as title. */
export function MonoId({ value, short = false }: { value: string; short?: boolean }) {
  const shown = short && value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  return (
    <span className={s.mono} title={short ? value : undefined}>
      {shown}
    </span>
  );
}

/** One term of a mandate: label, value, optional action (edit button). Use inside a <dl>. */
export function TermRow({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={s.termRow}>
      <dt>{label}</dt>
      <dd>{children}</dd>
      {action ?? <span aria-hidden="true" />}
    </div>
  );
}
