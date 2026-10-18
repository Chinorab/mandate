"use client";

/** Custom AG Grid cell renderers: every state shows an icon and a label, never color alone. */
import type { CustomCellRendererProps } from "ag-grid-react";
import { StateIcon } from "@/components/ui/icons";
import { Tag, type TagState } from "@/components/ui/Tag";
import type { MerchantOrder, OrderStatus } from "@/lib/merchant/orders";
import s from "./grid.module.css";

type P = CustomCellRendererProps<MerchantOrder>;

const STATUS: Record<OrderStatus, TagState> = {
  Paid: "compliant",
  Shipped: "awaiting",
  Delivered: "resolved",
  "In dispute": "dispute",
  Resolved: "resolved",
  Refunded: "revoked",
};

export function StatusCell({ value }: P) {
  if (!value) return null;
  return <Tag state={STATUS[value as OrderStatus] ?? "resolved"}>{value}</Tag>;
}

export function MandateCell({ data }: P) {
  if (!data) return null;
  return (
    <span className={s.mandate} title={`Version ${data.mandateVersion}, SHA256 ${data.sha256}`}>
      <StateIcon name="active" size={15} weight="bold" />
      <span className="mono">{data.mandateCode}</span>
      {data.mandateVersion > 1 ? <span className={s.version}>v{data.mandateVersion}</span> : null}
    </span>
  );
}

export function MandateStateCell({ value }: P) {
  if (!value) return null;
  const state: TagState = value === "Active" ? "active" : value === "Revoked" ? "revoked" : "expired";
  return <Tag state={state}>{value}</Tag>;
}

export function CheckCell({ data }: P) {
  if (!data) return null;
  const pass = data.check.passed === data.check.total && data.check.total > 0;
  return (
    <span className={`${s.check} ${pass ? s.pass : s.fail}`}>
      <StateIcon name={pass ? "compliant" : "fail"} size={15} weight="bold" />
      {data.check.passed} of {data.check.total} pass
    </span>
  );
}

export function MonoCell({ value }: P) {
  if (!value) return <span className={s.muted}>None</span>;
  return <span className={`mono ${s.monoSmall}`}>{String(value)}</span>;
}
