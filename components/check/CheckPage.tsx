"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MonoId } from "@/components/ui/Data";
import { BlockedOptions } from "./BlockedOptions";
import { StateIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/Tag";
import { COLOR_LABELS, type ColorId } from "@/lib/catalog/data";
import { formatEt } from "@/lib/check/explain";
import { ApiCallError, cartApi, type CheckView } from "@/lib/client/api";
import { formatUsd } from "@/lib/pricing";
import s from "./check.module.css";

function colorsText(colors: string[]) {
  return colors.map((c, i) => (i === 0 ? COLOR_LABELS[c as ColorId] : COLOR_LABELS[c as ColorId]?.toLowerCase())).join(" and ");
}

export function CheckPage({ code, cartId }: { code: string; cartId: string }) {
  const [view, setView] = useState<CheckView | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cartApi
      .view(cartId)
      .then(async (r) => (r.view.check ? r.view : (await cartApi.check(cartId)).view))
      .then(setView)
      .catch(() => setMissing(true));
  }, [cartId]);

  async function act(fn: () => Promise<CheckView>) {
    setBusy(true);
    setError(null);
    try {
      setView(await fn());
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "Something went wrong. Try again.");
      setView((await cartApi.view(cartId).catch(() => null))?.view ?? view);
    } finally {
      setBusy(false);
    }
  }

  const back = (
    <Link href={`/mandates/${code}`} className={s.back}>
      <StateIcon name="back" size={16} />
      Back to conversation
    </Link>
  );

  if (missing) {
    return (
      <main id="main" className={s.main}>
        {back}
        <p>This cart was not found in your session.</p>
      </main>
    );
  }
  if (!view?.check) {
    return (
      <main id="main" className={s.main}>
        {back}
        <p role="status">Running the Mandate check.</p>
      </main>
    );
  }

  const c = view.check;
  const pass = c.verdict === "pass";
  const terms = c.terms.filter((t) => t.group === "term" || !t.pass);
  const failedCount = c.summary.total - c.summary.passed;
  const line = view.cart.lines[0];
  const paid = view.order?.status === "captured";
  const closed = view.cart.status === "cancelled";

  return (
    <main id="main" className={s.main}>
      {back}
      <div className={s.head}>
        <div>
          <h1>{pass ? "Mandate check" : "Payment stopped"}</h1>
          <p>
            Cart at {view.cart.store.name} against <span className="mono">{view.mandate.code}</span>
            {view.mandate.versionNo > 1 ? `, version ${view.mandate.versionNo}` : ""}, checked{" "}
            {formatEt(new Date(c.createdAt))}
          </p>
        </div>
        <p role="status" className={`${s.verdict} ${pass ? s.pass : s.fail}`}>
          <StateIcon name={pass ? "compliant" : "blocked"} size={18} weight="bold" />
          <span className="num">
            {pass ? `${c.summary.passed} of ${c.summary.total} terms pass` : `Blocked, ${failedCount || "a safeguard"} of ${c.summary.total} terms fail`}
          </span>
        </p>
      </div>

      <div className={s.body}>
        {/* Focusable so keyboard users can scroll the table sideways on narrow screens. */}
        <section aria-labelledby="terms" className={s.tableWrap} tabIndex={0}>
          <h2 id="terms" className="visually-hidden">
            Terms checked
          </h2>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Result</th>
                <th scope="col">Term</th>
                <th scope="col">Mandate allows</th>
                <th scope="col">In this cart</th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.term}>
                  <td>
                    <span className={`${s.result} ${t.pass ? s.resultPass : s.resultFail}`}>
                      <StateIcon name={t.pass ? "compliant" : "fail"} size={16} weight="bold" />
                      {t.pass ? "Pass" : "Fail"}
                    </span>
                  </td>
                  <td className={s.termName}>
                    {t.label}
                    {t.kind === "semantic" ? <span className={s.why}> (judged)</span> : null}
                  </td>
                  <td className="num">{t.allowed}</td>
                  <td>
                    <span className={`${s.actual} num`}>{t.actual}</span>
                    <span className={`${s.why} num`}>{t.explanation}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside aria-labelledby="order" className={s.aside}>
          {!pass && !paid && !closed ? <BlockedOptions cartId={cartId} code={code} onChange={setView} /> : null}
          <div className={s.panel}>
            <div className={s.panelHead}>
              <h2 id="order">{line?.name}</h2>
              <span>
                {[line ? colorsText(line.colors) : "", line?.size ? `US size ${line.size}` : "", view.cart.store.name].filter(Boolean).join(", ")}
              </span>
            </div>
            <dl className={s.sums}>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatUsd(c.totals.subtotalCents)}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{formatUsd(c.totals.shippingCents)}</dd>
              </div>
              <div>
                <dt>Sales tax, estimated</dt>
                <dd>{formatUsd(c.totals.taxCents)}</dd>
              </div>
              <div className={s.total}>
                <dt>Total</dt>
                <dd>{formatUsd(c.totals.totalCents)}</dd>
              </div>
            </dl>
            <p className={s.of}>of {formatUsd(c.totals.remainingBudgetCents)} allowed</p>
            <div className={s.payBox}>
              {paid && view.order ? (
                <>
                  <Tag state="compliant">Paid through PayPal, order {view.order.code}</Tag>
                  <div className={s.meta}>
                    <span>
                      PayPal order <MonoId value={view.order.paypalOrderId ?? ""} />
                    </span>
                    <span>
                      Attached as custom_id <MonoId value={view.order.customId} short />
                    </span>
                  </div>
                </>
              ) : closed ? (
                <Tag state="revoked">Cancelled, not paid</Tag>
              ) : pass ? (
                <>
                  <p className={s.note}>Your agent pays with the PayPal account linked to this mandate. You can also pay now.</p>
                  <Button onClick={() => act(async () => (await cartApi.pay(cartId)).view)} disabled={busy}>
                    Pay With Linked PayPal
                  </Button>
                </>
              ) : (
                <p className={s.note}>Nothing was paid.</p>
              )}
              {error ? (
                <div className={s.alert} role="alert">
                  <StateIcon name="warning" size={16} />
                  <span>{error}</span>
                </div>
              ) : null}
            </div>
          </div>
          {paid ? <p className={s.note}>This check and your signed mandate are attached to the order.</p> : null}
        </aside>
      </div>
    </main>
  );
}
