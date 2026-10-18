"use client";

import type { CustomDetailCellRendererProps } from "ag-grid-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { StateIcon } from "@/components/ui/icons";
import { formatEt } from "@/lib/check/explain";
import { ApiCallError, merchantApi } from "@/lib/client/api";
import type { MerchantOrder } from "@/lib/merchant/orders";
import s from "./grid.module.css";

const CARRIERS = ["UPS", "USPS", "FEDEX", "DHL", "ONTRAC"];

/** Expanded row: the mandate behind the order, the check that allowed it, and shipment tracking. */
export function DetailRow({ data, context }: CustomDetailCellRendererProps<MerchantOrder> & { context: { onUpdated: (o: MerchantOrder) => void } }) {
  const [carrier, setCarrier] = useState("UPS");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!data) return null;
  const id = `trk-${data.code}`;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await merchantApi.addTracking(data!.code, carrier, number);
      setMsg({ ok: true, text: r.reported ? "Tracking saved and reported to PayPal." : "Tracking saved. Not reported to PayPal: the sandbox is not configured." });
      if (r.order) context.onUpdated(r.order);
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiCallError ? err.message : "Tracking could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.detail} role="region" aria-label={`Order ${data.code} details`}>
      <section>
        <h3>Mandate {data.mandateCode}</h3>
        <dl className={s.facts}>
          <dt>Terms</dt>
          <dd>{data.detail.terms}</dd>
          <dt>Signed</dt>
          <dd>
            {formatEt(new Date(data.detail.signedAt))}, version {data.mandateVersion}
          </dd>
          <dt>Fingerprint</dt>
          <dd className="mono">SHA256 {data.sha256}</dd>
          <dt>PayPal custom_id</dt>
          <dd className="mono">{data.detail.customId}</dd>
          <dt>Buyer</dt>
          <dd>{data.buyer}</dd>
        </dl>
      </section>
      <section>
        <h3>Mandate check, {formatEt(new Date(data.detail.checkedAt))}</h3>
        <table className={s.terms}>
          <caption className="visually-hidden">Terms checked before payment</caption>
          <tbody>
            {data.detail.checkTerms
              .filter((t) => t.group === "term")
              .map((t) => (
                <tr key={t.term}>
                  <td className={t.pass ? s.pass : s.fail}>
                    <StateIcon name={t.pass ? "compliant" : "fail"} size={14} weight="bold" label={t.pass ? "Pass" : "Fail"} />
                  </td>
                  <td>{t.label}</td>
                  <td>{t.actual}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {data.tracking ? (
          <p className={s.note}>
            Shipped with {data.tracking.carrier}, tracking <span className="mono">{data.tracking.number}</span>
          </p>
        ) : data.status === "Paid" ? (
          <form className={s.trackForm} onSubmit={save} aria-label={`Add tracking for order ${data.code}`}>
            <div className={s.field}>
              <label htmlFor={`${id}-carrier`}>Carrier</label>
              <select id={`${id}-carrier`} className={s.select} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                {CARRIERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className={`${s.field} ${s.grow}`}>
              <label htmlFor={`${id}-number`}>Tracking number</label>
              <input id={`${id}-number`} className={s.input} value={number} onChange={(e) => setNumber(e.target.value)} autoComplete="off" />
            </div>
            <Button type="submit" size="sm" disabled={busy || number.trim().length < 8}>
              Add Tracking
            </Button>
          </form>
        ) : null}
        {data.disputeId ? (
          <p className={s.note}>
            <StateIcon name="dispute" size={14} /> {data.disputeStatus === "RESOLVED" ? "A dispute on this order is resolved." : "This order is in dispute."}{" "}
            {/* A plain link: the grid cancels click events inside detail rows, which client side links respect. */}
            <a href={`/merchant/disputes/${data.disputeId}`}>Open the dispute</a>
          </p>
        ) : null}
        {msg ? (
          <p className={msg.ok ? s.note : s.alert} role={msg.ok ? "status" : "alert"}>
            {msg.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
