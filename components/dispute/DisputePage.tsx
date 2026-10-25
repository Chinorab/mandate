"use client";

/**
 * Dispute detail (design/project/DisputeDetail.dc.html, US6): the case, a timeline from stored records,
 * the evidence file with include toggles, the editable response, and submission behind the accuracy
 * statement. Read only for any session other than the one that claimed the dispute.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REPO_URL } from "@/components/shell/Shell";
import { Button } from "@/components/ui/Button";
import { StateIcon, type IconName } from "@/components/ui/icons";
import { Tag } from "@/components/ui/Tag";
import { ApiCallError, disputeApi } from "@/lib/client/api";
import { dayEt, longEt } from "@/lib/disputes/format";
import type { DisputeView, TimelineStep } from "@/lib/disputes/view";
import { formatUsd } from "@/lib/pricing";
import s from "./dispute.module.css";

const NOTES_MAX = 2000;

const STEP_ICON: Record<string, IconName> = {
  "Mandate signed": "edit",
  "Mandate check passed": "compliant",
  "Mandate check": "fail",
  "Payment captured": "payment",
  Shipped: "shipment",
  Delivered: "shipment",
  "Dispute opened": "dispute",
  "Your response": "awaiting",
};

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className={s.timeline}>
      {steps.map((t, i) => {
        const last = i === steps.length - 1;
        const nextPending = steps[i + 1]?.state === "pending";
        return (
          <li key={t.title} className={s.step}>
            <div className={s.rail}>
              <span className={`${s.dot} ${t.state === "alert" ? s.alert : ""} ${t.state === "pending" ? s.pending : ""}`}>
                <StateIcon name={STEP_ICON[t.title] ?? "info"} size={16} />
              </span>
              {last ? null : <span className={`${s.line} ${nextPending ? s.dashed : ""}`} />}
            </div>
            <div className={s.stepBody}>
              <span className={s.stepTitle}>{t.title}</span>
              {t.at ? <span className={`${s.stepTime} num`}>{longEt(new Date(t.at))}</span> : null}
              <span className={`${s.stepDetail} num`}>{t.detail}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Notice({ view, poolEmpty }: { view: DisputeView; poolEmpty: boolean }) {
  const r = view.readOnlyReason;
  if (!r) return null;
  const text =
    r === "submitted"
      ? `Evidence submitted ${view.evidence?.submittedAt ? longEt(new Date(view.evidence.submittedAt)) : ""}. ${view.statusLabel}.`
      : r === "resolved"
        ? "This dispute is resolved. Nothing more can be sent."
        : r === "not_ready"
          ? "The evidence file is being assembled from the order records. This page updates on its own."
          : r === "unclaimed"
            ? "No demo session is answering this dispute yet. Open Disputes in the merchant view to take it and answer it."
            : "Another demo session is answering this dispute. You can read everything here; only that session can change or submit it.";
  return (
    <div className={s.notice} role="status">
      <StateIcon name={r === "submitted" ? "compliant" : "info"} size={18} />
      <span>
        {text}
        {poolEmpty && !view.claimedByYou ? (
          <>
            {" "}
            Every dispute in the demo pool has been claimed, so this one is shown read only. To open a new sandbox dispute, follow the{" "}
            <a href={`${REPO_URL}#open-a-sandbox-dispute`}>steps in the README</a>.
          </>
        ) : null}
      </span>
    </div>
  );
}

export function DisputePage({ id, poolEmpty = false }: { id: string; poolEmpty?: boolean }) {
  const [view, setView] = useState<DisputeView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<"save" | "submit" | "toggle" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Include toggles show at once and are confirmed by the server's answer.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const apply = useCallback((v: DisputeView) => {
    setView(v);
    if (!dirtyRef.current) setText(v.evidence?.response ?? "");
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      disputeApi
        .get(id)
        .then((v) => {
          if (stop) return;
          apply(v);
          if (v.readOnlyReason === "not_ready") timer = setTimeout(load, 2000);
        })
        .catch((e) => !stop && setLoadError(e instanceof ApiCallError ? e.message : "The dispute could not be loaded."));
    load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, apply]);

  if (loadError) {
    return (
      <main id="main" className={s.empty}>
        <h1>Dispute not available</h1>
        <p role="alert">{loadError}</p>
        <Link href="/merchant">Back to all orders</Link>
      </main>
    );
  }
  if (!view) {
    return (
      <main id="main" className={s.main} aria-busy="true">
        <div className={s.skeleton} style={{ width: 120 }} />
        <div className={s.skeleton} style={{ width: "40%", height: 40 }} />
        <div className={s.skeleton} style={{ width: "70%" }} />
      </main>
    );
  }

  const ev = view.evidence;
  const items = (ev?.items ?? []).map((i) => (i.key in pending ? { ...i, included: pending[i.key] } : i));
  const included = items.filter((i) => i.included).length;
  const editable = view.canEdit && !busy;
  const tooLong = text.length > NOTES_MAX;
  const ready = view.canEdit && reviewed && included > 0 && text.trim().length > 0 && !tooLong;

  async function run(kind: "save" | "submit" | "toggle", fn: () => Promise<DisputeView>, done?: string) {
    setBusy(kind);
    setMessage(null);
    try {
      const v = await fn();
      apply(v);
      if (done) setMessage({ ok: true, text: done });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiCallError ? e.message : "Something went wrong. Your draft is kept. Try again." });
      if (e instanceof ApiCallError) disputeApi.get(id).then(apply, () => undefined);
    } finally {
      setBusy(null);
    }
  }

  const toggle = async (key: string, on: boolean) => {
    setPending((p) => ({ ...p, [key]: on }));
    await run("toggle", () => disputeApi.save(id, { [key]: on }));
    setPending((p) => {
      const { [key]: _done, ...rest } = p;
      void _done;
      return rest;
    });
  };
  const saveDraft = () =>
    run(
      "save",
      async () => {
        const v = await disputeApi.save(id, {}, text);
        setDirty(false);
        return v;
      },
      "Draft saved.",
    );
  const useDraft = () =>
    run("save", async () => {
      setDirty(false);
      dirtyRef.current = false;
      return disputeApi.save(id, {}, null);
    });
  const submit = () =>
    run(
      "submit",
      async () => {
        if (dirty) {
          await disputeApi.save(id, {}, text);
          setDirty(false);
          dirtyRef.current = false;
        }
        return disputeApi.submit(id);
      },
      `Evidence submitted. PayPal received the response and ${included} ${included === 1 ? "item" : "items"}.`,
    );

  const helper = message
    ? message.text
    : !view.canEdit
      ? "Read only."
      : included === 0
        ? "Include at least one evidence item."
        : tooLong
          ? `Keep the response under ${NOTES_MAX} characters.`
          : !reviewed
            ? "Confirm your review to enable submission."
            : "Ready to submit. PayPal receives the response and the included items.";

  const open_ = !/RESOLVED|CLOSED/.test(view.status);

  return (
    <main id="main" className={s.main}>
      <Link href="/merchant" className={s.back}>
        <StateIcon name="back" size={16} />
        All orders
      </Link>

      <div className={s.head}>
        <div className={s.headText}>
          <div className={s.tags}>
            {open_ ? <Tag state="dispute" /> : <Tag state="resolved" />}
            {ev?.submittedAt ? (
              <Tag state="compliant">Evidence submitted</Tag>
            ) : view.respondBy && open_ ? (
              <Tag state="awaiting">
                <span className="num">Respond by {dayEt(new Date(view.respondBy))}</span>
              </Tag>
            ) : null}
          </div>
          <h1>
            {view.order ? (
              <>
                Dispute on order <span className="num">{view.order.code}</span>
              </>
            ) : (
              "Dispute on an order without a mandate"
            )}
          </h1>
          <p>{view.summary}</p>
        </div>
        {/* Two lists side by side: valid dl content is dt/dd or div groups directly inside each list. */}
        <div className={`${s.facts} num`}>
          {view.amountCents != null ? (
            <dl className={s.amount}>
              <dt>Disputed amount</dt>
              <dd>{formatUsd(view.amountCents)}</dd>
            </dl>
          ) : null}
          <dl className={s.caseFacts}>
            <div>
              <dt>Reason </dt>
              <dd>{view.reasonLabel}</dd>
            </div>
            {view.openedAt ? (
              <div>
                <dt>Opened </dt>
                <dd>{longEt(new Date(view.openedAt))}</dd>
              </div>
            ) : null}
            <div>
              <dt>PayPal case </dt>
              <dd className="mono" style={{ fontSize: 13 }}>
                {view.paypalDisputeId}
              </dd>
            </div>
            {view.order ? (
              <div>
                <dt>Buyer </dt>
                <dd>{view.order.buyer.replace(/^Buyer /, "")}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      <Notice view={view} poolEmpty={poolEmpty} />

      <div className={s.columns}>
        <section aria-labelledby="tl" className={`${s.card} ${s.timelineCard}`}>
          <h2 id="tl">Timeline</h2>
          <Timeline steps={view.timeline} />
        </section>

        <section aria-labelledby="ev" className={`${s.card} ${s.evidenceCard}`}>
          <div className={s.cardHead}>
            <h2 id="ev">Evidence file</h2>
            <p className="num">
              Assembled from the order records. {included} of {items.length} {items.length === 1 ? "item" : "items"} included.{" "}
              {ev ? (
                <a href={`/api/merchant/disputes/${view.id}/report`} target="_blank" rel="noreferrer">
                  Open the evidence report
                </a>
              ) : null}
            </p>
          </div>
          <ul className={s.items}>
            {items.map((it) => {
              const inputId = `ev-${it.key}`;
              return (
                <li key={it.key} className={s.item}>
                  <div className={s.itemRow}>
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={it.included}
                      disabled={!editable}
                      onChange={(e) => toggle(it.key, e.target.checked)}
                    />
                    <label htmlFor={inputId} className={`${s.itemLabel} ${view.canEdit ? "" : s.static}`}>
                      <span className={s.docIcon}>
                        <StateIcon name={it.key === "shipment" ? "shipment" : it.key === "transaction" ? "payment" : "document"} size={18} />
                      </span>
                      <span className={s.itemText}>
                        <span className={s.itemTitle}>{it.title}</span>
                        <span className={`${s.itemMeta} num`}>{it.meta}</span>
                      </span>
                    </label>
                    <button
                      type="button"
                      className={s.view}
                      aria-expanded={Boolean(open[it.key])}
                      aria-controls={`${inputId}-facts`}
                      onClick={() => setOpen((o) => ({ ...o, [it.key]: !o[it.key] }))}
                    >
                      {open[it.key] ? "Hide" : "View"}
                    </button>
                  </div>
                  {open[it.key] ? (
                    <div id={`${inputId}-facts`} className={s.itemFacts}>
                      <span>From the stored record:</span>
                      <ul>
                        {it.facts.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {items.length === 0 && ev ? <p className={s.missing}>No evidence item: this order has no mandate record in Mandate.</p> : null}
        </section>
      </div>

      {ev ? (
        <section aria-labelledby="resp" className={s.card}>
          <div className={s.responseHead}>
            <h2 id="resp">Response to PayPal</h2>
            <p>
              {view.canEdit
                ? "Draft written from the evidence file. Every sentence rests on an included item. Edit anything before you submit."
                : "The response as written for this dispute."}
            </p>
          </div>
          <div className={s.responseBody}>
            <div className={s.labelRow}>
              <label htmlFor="draft">Response text</label>
              <span className={`${s.count} num`} aria-live="polite">
                {text.length} of {NOTES_MAX} characters
              </span>
            </div>
            <textarea
              id="draft"
              name="response"
              rows={10}
              className={s.textarea}
              value={text}
              readOnly={!view.canEdit}
              aria-invalid={tooLong || undefined}
              onChange={(e) => {
                setText(e.target.value);
                setDirty(true);
                setMessage(null);
              }}
            />
            {view.canEdit && (ev.edited || dirty) ? (
              <button type="button" className={s.reset} onClick={useDraft} disabled={!editable}>
                Use the draft again
              </button>
            ) : null}
          </div>
          {view.canEdit ? (
            <div className={s.actions}>
              <label htmlFor="reviewed" className={s.confirm}>
                <input id="reviewed" name="reviewed" type="checkbox" checked={reviewed} onChange={(e) => {
                    setReviewed(e.target.checked);
                    setMessage(null);
                  }} />
                <span>I read this response and checked every included item. It is accurate to the best of my knowledge.</span>
              </label>
              <div className={s.buttons}>
                <Button variant="secondary" onClick={saveDraft} disabled={!editable || !dirty || tooLong}>
                  Save Draft
                </Button>
                <Button onClick={submit} disabled={!ready || Boolean(busy)}>
                  <StateIcon name="submit" size={18} />
                  {busy === "submit" ? "Submitting" : "Submit Evidence"}
                </Button>
              </div>
            </div>
          ) : null}
          <p
            className={`${s.helper} ${message ? (message.ok ? s.ok : s.error) : ""}`}
            role={message && !message.ok ? "alert" : undefined}
            aria-live="polite"
          >
            {helper}
          </p>
        </section>
      ) : null}
    </main>
  );
}
