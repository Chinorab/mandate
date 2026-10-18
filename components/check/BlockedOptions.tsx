"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StateIcon } from "@/components/ui/icons";
import { ApiCallError, cartApi, type CheckView, type OptionsBody } from "@/lib/client/api";
import { formatUsd } from "@/lib/pricing";
import s from "./check.module.css";

/**
 * The three ways out of a blocked cart (design/project/Blocked.dc.html): widen the mandate with an
 * explicit approval, switch to a product that passes every term, or cancel. Nothing here pays.
 */
export function BlockedOptions({ cartId, code, onChange }: { cartId: string; code: string; onChange: (v: CheckView) => void }) {
  const router = useRouter();
  const [options, setOptions] = useState<OptionsBody | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cartApi.options(cartId).then(setOptions).catch(() => setOptions(null));
  }, [cartId]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "Something went wrong. Try again.");
      cartApi.options(cartId).then(setOptions).catch(() => undefined);
      setAck(false);
    } finally {
      setBusy(false);
    }
  }

  const amendment = options?.amendment;
  const alt = options?.alternative;
  const n = amendment?.amendable ? amendment.changes.length : 0;

  return (
    <section aria-labelledby="options" className={s.options}>
      <h2 id="options" className={s.optionsTitle}>
        What would you like to do?
      </h2>

      {amendment?.amendable ? (
        <div className={s.panel}>
          <div className={s.optionHead}>
            <h3>Widen the mandate</h3>
            <p>Only these changes. Everything else stays as signed.</p>
          </div>
          <table className={`${s.changes} num`}>
            <caption className="visually-hidden">Proposed changes</caption>
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Now</th>
                <th scope="col">Proposed</th>
              </tr>
            </thead>
            <tbody>
              {amendment.changes.map((c) => (
                <tr key={`${c.term}${c.to}`}>
                  <th scope="row">{c.label}</th>
                  <td className={s.now}>{c.term === "budget" ? <s>{c.from}</s> : c.from}</td>
                  <td className={s.proposed}>{c.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.approve}>
            <label htmlFor="ack" className={s.ack}>
              <input id="ack" name="approve_changes" type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                I approve {n === 1 ? "this change" : `these ${n} changes`} to <span className="mono">{amendment.mandateCode}</span>. My agent may then
                complete this purchase.
              </span>
            </label>
            <Button
              disabled={!ack || busy}
              onClick={() => run(async () => onChange((await cartApi.amend(cartId, amendment.proposalHash)).view))}
            >
              Approve Changes
            </Button>
            <p className={s.helper} aria-live="polite">
              {ack ? "Your approval is signed and added to the mandate history." : "Tick the box above to enable approval."}
            </p>
          </div>
        </div>
      ) : amendment ? (
        <div className={`${s.panel} ${s.optionHead}`}>
          <h3>Widen the mandate</h3>
          <p>{amendment.reason}</p>
        </div>
      ) : null}

      {alt ? (
        <div className={`${s.panel} ${s.optionCard}`}>
          <div className={s.optionHeadPlain}>
            <h3>Keep the mandate as is</h3>
            <p className="num">
              {alt.name}, {alt.variant.toLowerCase()}, at {alt.storeName}, passes every term at {formatUsd(alt.totalCents)}.
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await cartApi.switchTo(cartId);
                router.push(`/mandates/${code}/check/${r.cartId}`);
              })
            }
          >
            Switch to {alt.name}
          </Button>
        </div>
      ) : null}

      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          run(async () => {
            await cartApi.cancel(cartId);
            onChange((await cartApi.view(cartId)).view);
          })
        }
      >
        Cancel Purchase
      </Button>

      {error ? (
        <div className={s.alert} role="alert">
          <StateIcon name="warning" size={16} />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}
