"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { StateIcon } from "@/components/ui/icons";
import { Tag, type TagState } from "@/components/ui/Tag";
import { CATEGORIES, COLOR_LABELS, STORES } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS } from "@/lib/check/explain";
import { ApiCallError, agentApi, mandateApi, type ChatItem, type MandateView } from "@/lib/client/api";
import { formatUsd } from "@/lib/pricing";
import s from "./chat.module.css";

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const at = (iso: string | null) => (iso ? TIME.format(new Date(iso)) : "");
const SHORT_ET = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

const FIT_TAG: Record<string, TagState> = { compliant: "compliant", awaiting: "awaiting", blocked: "blocked" };

function Sidebar({ m }: { m: MandateView }) {
  const t = m.terms;
  const left = (t.budgetCents ?? 0) - m.spentCents;
  const colors = t.required?.colors?.length
    ? t.required.colors.map((c, i) => (i === 0 ? COLOR_LABELS[c] : COLOR_LABELS[c].toLowerCase())).join(", ")
    : "Any";
  const merchants = !t.merchants || t.merchants === "ANY_LISTED" ? "3 demo stores" : t.merchants.map((id) => STORES.find((x) => x.id === id)?.name ?? id).join(", ");
  return (
    <aside aria-labelledby="scope" className={s.aside}>
      <div className={s.asideHead}>
        <h2 id="scope">Shopping inside</h2>
        <div className={s.asideCode}>
          <span>{m.code}</span>
          {m.status === "active" ? <Tag state="active" /> : m.status === "revoked" ? <Tag state="revoked" /> : m.status === "expired" ? <Tag state="expired" /> : <Tag state="awaiting">Not active</Tag>}
        </div>
      </div>
      <div className={s.budget}>
        <span>Budget left</span>
        <span className={s.budgetValue}>{formatUsd(left)}</span>
      </div>
      <dl className={s.facts}>
        <div>
          <dt>Category</dt>
          <dd>{t.category ? CATEGORIES[t.category] : "Not set"}</dd>
        </div>
        {t.required?.size ? (
          <div>
            <dt>Size</dt>
            <dd>
              {SIZE_SYSTEM_LABELS[t.required.size.system]} {t.required.size.value}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Colors</dt>
          <dd>{colors}</dd>
        </div>
        <div>
          <dt>Merchants</dt>
          <dd>{merchants}</dd>
        </div>
        <div>
          <dt>Orders</dt>
          <dd className="num">
            {m.ordersUsed} of {t.maxPurchases ?? 1} used
          </dd>
        </div>
        <div>
          <dt>Expires</dt>
          <dd className="num">{t.expiresAt ? `${SHORT_ET.format(new Date(t.expiresAt))} ET` : "Not set"}</dd>
        </div>
      </dl>
      <div className={s.asideFoot}>
        <Link href={`/mandates/new?code=${m.code}`}>View full mandate</Link>
      </div>
    </aside>
  );
}

function Item({ item, code }: { item: ChatItem; code: string }) {
  const review = (cartId: string) => (
    <Link href={`/mandates/${code}/check/${cartId}`} style={{ fontWeight: 500 }}>
      Review Mandate Check
    </Link>
  );
  switch (item.kind) {
    case "user":
      return (
        <li className={s.mine}>
          <span className={s.who}>You{item.at ? `, ${at(item.at)}` : ""}</span>
          <p>{item.text}</p>
        </li>
      );
    case "agent":
      return (
        <li className={s.theirs}>
          <span className={s.who}>
            <StateIcon name="agent" size={16} />
            Shopping agent{item.at ? `, ${at(item.at)}` : ""}
          </span>
          {/* One paragraph per line: plainText turns list items into lines of their own. */}
          {item.text.split(/\n+/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </li>
      );
    case "options":
      return (
        <li className={s.theirs}>
          <ul className={s.cards} aria-label="Proposed products">
            {item.cards.map((c) => (
              <li key={c.id} className={s.card}>
                <div className={s.thumb} aria-hidden="true">
                  <StateIcon name="product" size={24} />
                </div>
                <div className={s.cardText}>
                  <strong>{c.name}</strong>
                  <span>{c.variant}</span>
                  <span>
                    {c.storeName}, {c.shipping}
                  </span>
                </div>
                <div className={s.cardPrice}>
                  <span>{formatUsd(c.priceCents)}</span>
                  <Tag state={FIT_TAG[c.fit.tone]}>{c.fit.label}</Tag>
                </div>
              </li>
            ))}
          </ul>
        </li>
      );
    case "cart":
      return (
        <li className={s.theirs}>
          <div className={s.event}>
            <div className={s.eventRow}>
              <span>
                {item.product} is in a cart at {item.store}, <span className="num">{formatUsd(item.totalCents)}</span> total.
              </span>
            </div>
          </div>
        </li>
      );
    case "check":
      return (
        <li className={s.theirs}>
          <div className={s.event}>
            <div className={s.eventRow}>
              <Tag state={item.verdict === "pass" ? "compliant" : "blocked"}>
                {item.verdict === "pass" ? `${item.passed} of ${item.total} terms pass` : `Blocked, ${item.total - item.passed} of ${item.total} terms fail`}
              </Tag>
              {review(item.cartId)}
            </div>
          </div>
        </li>
      );
    case "payment":
      return (
        <li className={s.theirs}>
          <div className={s.event}>
            <div className={s.eventRow}>
              {item.status === "paid" ? (
                <Tag state="compliant">Paid, order {item.orderCode}</Tag>
              ) : item.status === "refused" ? (
                <Tag state="blocked">Payment stopped</Tag>
              ) : (
                <Tag state="awaiting">Not paid yet</Tag>
              )}
              {review(item.cartId)}
            </div>
            {item.status === "refused" && item.failed.length ? (
              <ul className={s.failed}>
                {item.failed.map((f) => (
                  <li key={f.term}>{f.explanation}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>
      );
  }
}

export function AgentChat({ code }: { code: string }) {
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([mandateApi.get(code), agentApi.thread(code)])
      .then(([m, t]) => {
        setMandate(m.mandate);
        setItems(t.items);
      })
      .catch(() => setMissing(true));
  }, [code]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setItems((prev) => [...prev, { kind: "user", text: message, at: new Date().toISOString() }]);
    setText("");
    try {
      const r = await agentApi.send(code, message);
      setItems(r.items);
      setMandate((await mandateApi.get(code)).mandate);
    } catch (err) {
      setItems((prev) => prev.slice(0, -1));
      setText(message);
      setError(err instanceof ApiCallError ? err.message : "Your agent could not answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <main id="main" className={s.main}>
        <p>
          This mandate was not found in your session. <Link href="/mandates/new">Create a mandate</Link>
        </p>
      </main>
    );
  }
  if (!mandate) {
    return (
      <main id="main" className={s.main}>
        <p className={s.status} role="status">
          Loading your mandate.
        </p>
      </main>
    );
  }

  const active = mandate.status === "active";
  return (
    <main id="main" className={s.main}>
      <Sidebar m={mandate} />
      <section aria-labelledby="conv" className={s.conv}>
        <h1 id="conv" className={s.title}>
          {mandate.terms.category ? CATEGORIES[mandate.terms.category] : "Shopping agent"}
        </h1>
        {items.length ? (
          <ol className={s.list} aria-label="Conversation">
            {items.map((it, i) => (
              <Item key={i} item={it} code={code} />
            ))}
          </ol>
        ) : (
          <p className={s.status}>Ask your agent to find something inside this mandate.</p>
        )}
        <div ref={endRef} />
        <p className={s.status} role="status" aria-live="polite">
          {busy ? "Your agent is working." : ""}
        </p>
        {error ? (
          <div className={`${s.notice} ${s.error}`} role="alert">
            <StateIcon name="warning" size={16} />
            <span>{error}</span>
          </div>
        ) : null}
        {active ? (
          <form className={s.composer} onSubmit={send}>
            <div className={s.field}>
              <label htmlFor="agent-message">Message your agent</label>
              <textarea
                id="agent-message"
                rows={2}
                maxLength={1000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
            <Button type="submit" disabled={busy || !text.trim()}>
              Send
            </Button>
          </form>
        ) : (
          <div className={s.notice} role="status">
            <StateIcon name="info" size={16} />
            <span>
              Your agent can shop once the mandate is signed and PayPal is linked. <Link href={`/mandates/new?code=${code}`}>Finish the mandate</Link>
            </span>
          </div>
        )}
      </section>
    </main>
  );
}
