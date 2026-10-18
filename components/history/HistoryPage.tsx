"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { MonoId } from "@/components/ui/Data";
import { Mark } from "@/components/ui/Mark";
import { StateIcon } from "@/components/ui/icons";
import { Tag, type TagState } from "@/components/ui/Tag";
import { CATEGORIES, COLOR_LABELS, STORES } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS, formatEt } from "@/lib/check/explain";
import { ApiCallError, mandateApi, type ActivityBody, type MandateView } from "@/lib/client/api";
import { formatUsd } from "@/lib/pricing";
import s from "./history.module.css";

type Filter = "all" | "active" | "expired" | "revoked";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expired", label: "Expired" },
  { key: "revoked", label: "Revoked" },
];

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const SIGNED = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

function title(m: MandateView) {
  return m.terms.category ? CATEGORIES[m.terms.category] : m.instructions.slice(0, 40) || "Untitled mandate";
}

function tagFor(m: MandateView): { state: TagState; label: string } {
  switch (m.status) {
    case "active":
      return { state: "active", label: "Active" };
    case "revoked":
      return { state: "revoked", label: "Revoked" };
    case "expired":
      return { state: "expired", label: "Expired" };
    case "awaiting_link":
      return { state: "awaiting", label: "Link PayPal" };
    default:
      return { state: "awaiting", label: "Draft" };
  }
}

function subline(m: MandateView) {
  const budget = m.terms.budgetCents !== undefined ? `Up to ${formatUsd(m.terms.budgetCents)}` : "No budget yet";
  if (m.status === "revoked" && m.revokedAt) return `${budget}, revoked ${DAY.format(new Date(m.revokedAt))}`;
  if (!m.terms.expiresAt) return budget;
  return `${budget}, ${m.status === "expired" ? "expired" : "expires"} ${DAY.format(new Date(m.terms.expiresAt))}`;
}

const OUTCOME: Record<string, { state: TagState; label: string }> = {
  paid: { state: "compliant", label: "Compliant, paid" },
  blocked: { state: "blocked", label: "Blocked, not paid" },
  cancelled: { state: "revoked", label: "Cancelled" },
  not_paid: { state: "awaiting", label: "Checked, not paid" },
  checked: { state: "awaiting", label: "Checked, not paid" },
  open: { state: "awaiting", label: "Open" },
};

function Detail({ m, onChanged }: { m: MandateView; onChanged: (m: MandateView) => void }) {
  const [activity, setActivity] = useState<ActivityBody | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = m.terms;

  // Detail is keyed by mandate code, so local state starts fresh per mandate; refetch on status change.
  useEffect(() => {
    if (!m.version) return;
    let alive = true;
    mandateApi
      .activity(m.code)
      .then((a) => alive && setActivity(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [m.code, m.version, m.status]);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      onChanged((await mandateApi.revoke(m.code)).mandate);
    } catch (e) {
      setError(e instanceof ApiCallError ? e.message : "The mandate could not be revoked. Try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const colors = t.required?.colors?.length ? t.required.colors.map((c, i) => (i === 0 ? COLOR_LABELS[c] : COLOR_LABELS[c].toLowerCase())).join(", ") : "Any";
  const merchants = !t.merchants || t.merchants === "ANY_LISTED" ? "Any of the 3 demo stores" : t.merchants.map((id) => STORES.find((x) => x.id === id)?.name ?? id).join(", ");
  const amended = activity?.versions.filter((v) => v.versionNo > 1) ?? [];
  const canRevoke = m.status === "active" || m.status === "awaiting_link" || m.status === "expired";

  return (
    <section aria-labelledby="detail" className={s.detail}>
      <div className={s.card}>
        <div className={s.cardHead}>
          <div className={s.cardTitle}>
            <h2 id="detail">{title(m)}</h2>
            <span>
              <span className="mono">{m.code}</span>
              {m.version ? `, signed ${SIGNED.format(new Date(m.version.signedAt))} ET` : ", not signed yet"}
            </span>
          </div>
          <div className={s.actions}>
            {m.version ? (
              <ButtonLink variant="secondary" size="sm" href={mandateApi.receiptUrl(m.code)} prefetch={false} download>
                <StateIcon name="download" size={18} />
                Download Receipt
              </ButtonLink>
            ) : null}
            {canRevoke ? (
              <Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={busy || confirming}>
                <StateIcon name="revoked" size={18} />
                Revoke Mandate
              </Button>
            ) : null}
          </div>
        </div>

        {confirming ? (
          <div className={s.confirm} role="alertdialog" aria-labelledby="revoke-q" aria-describedby="revoke-d">
            <p id="revoke-q">
              <strong>
                Revoke <span className="mono">{m.code}</span>?
              </strong>
            </p>
            <p id="revoke-d">Your agent stops immediately, open carts are cancelled and PayPal is unlinked. This cannot be undone.</p>
            <div className={s.actions}>
              <Button variant="danger" size="sm" onClick={revoke} disabled={busy}>
                Revoke Now
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
                Keep Mandate
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <div className={s.alert} role="alert" style={{ margin: "12px 28px" }}>
            <StateIcon name="warning" size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className={s.figures}>
          <div className={s.figure}>
            <span>Spent</span>
            <span className={s.big}>{formatUsd(m.spentCents)}</span>
          </div>
          <div className={s.figure}>
            <span>Budget</span>
            <span className={`${s.big} ${s.muted}`}>{t.budgetCents !== undefined ? formatUsd(t.budgetCents) : "Not set"}</span>
          </div>
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
            <dt>Expires</dt>
            <dd className="num">{t.expiresAt ? formatEt(new Date(t.expiresAt)) : "Not set"}</dd>
          </div>
          <div>
            <dt>Changes</dt>
            <dd>
              {amended.length
                ? amended.map((v) => `Version ${v.versionNo}: ${v.changes.map((c) => `${c.label.toLowerCase()} ${c.from} to ${c.to}`).join(", ")}`).join(". ")
                : "None since signing"}
            </dd>
          </div>
        </dl>
        <div className={s.cardFoot}>
          {m.status === "active" ? (
            <Link href={`/mandates/${m.code}`}>Open shopping agent</Link>
          ) : m.status === "draft" || m.status === "awaiting_link" ? (
            <Link href={`/mandates/new?code=${m.code}`}>Finish this mandate</Link>
          ) : (
            <Link href={`/mandates/new?code=${m.code}`}>View the signed terms</Link>
          )}
        </div>
      </div>

      {activity ? (
        <>
          <div className={s.section}>
            <h3>Attached activity</h3>
            {activity.activity.length ? (
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Item</th>
                      <th scope="col">Store</th>
                      <th scope="col" className={s.right}>
                        Total
                      </th>
                      <th scope="col">Check</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.activity.map((a) => {
                      const o = OUTCOME[a.outcome];
                      return (
                        <tr key={a.cartId}>
                          <td>{STAMP.format(new Date(a.at))}</td>
                          <td>
                            <Link href={`/mandates/${m.code}/check/${a.cartId}`}>{a.item}</Link>
                          </td>
                          <td>{a.store}</td>
                          <td className={s.right}>{formatUsd(a.totalCents)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {a.passed === a.total ? `${a.passed} of ${a.total} pass` : `${a.total - a.passed} of ${a.total} fail`}
                          </td>
                          <td>
                            <Tag state={o.state}>{o.label}</Tag>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={s.muted} style={{ margin: 0 }}>
                Nothing yet. Carts your agent checks under this mandate appear here.
              </p>
            )}
          </div>

          <div className={s.section}>
            <h3>Receipt preview</h3>
            <article aria-label="Mandate receipt" className={s.receipt}>
              <div className={s.receiptHead}>
                <span>
                  <Mark size={20} />
                  Mandate receipt
                </span>
                <span>Issued {SIGNED.format(new Date(activity.receipt.issuedAt))} ET</span>
              </div>
              <dl className={`${s.receiptFields} num`}>
                <dt>Mandate</dt>
                <dd className="mono">{activity.code}</dd>
                <dt>Holder</dt>
                <dd>{activity.receipt.session}</dd>
                <dt>Instructions</dt>
                <dd>{`“${activity.instructions}”`}</dd>
                <dt>Terms</dt>
                <dd>{activity.receipt.terms}</dd>
                <dt>Fingerprint</dt>
                <dd>
                  SHA256 <MonoId value={activity.receipt.fingerprint} short />
                </dd>
                <dt>Versions</dt>
                <dd>{activity.versions.length}</dd>
                <dt>Orders</dt>
                <dd>{activity.receipt.orders}</dd>
              </dl>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}

export function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [mandates, setMandates] = useState<MandateView[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    mandateApi.list().then((r) => setMandates(r.mandates)).catch(() => setMandates([]));
  }, []);

  const counts = useMemo(() => {
    const list = mandates ?? [];
    return {
      all: list.length,
      active: list.filter((m) => m.status === "active").length,
      expired: list.filter((m) => m.status === "expired").length,
      revoked: list.filter((m) => m.status === "revoked").length,
    };
  }, [mandates]);

  const shown = (mandates ?? []).filter((m) => filter === "all" || m.status === filter);
  const selectedCode = params.get("code");
  const selected = shown.find((m) => m.code === selectedCode) ?? shown[0] ?? null;
  const select = (code: string) => router.replace(`${pathname}?code=${code}`, { scroll: false });
  const replace = (m: MandateView) => setMandates((prev) => (prev ?? []).map((x) => (x.code === m.code ? m : x)));

  return (
    <main id="main" className={s.main}>
      <div className={s.head}>
        <h1>History</h1>
        <ButtonLink href="/mandates/new" size="sm">
          <StateIcon name="edit" size={18} />
          New Mandate
        </ButtonLink>
      </div>

      {mandates === null ? (
        <p className={s.muted} role="status">
          Loading your mandates.
        </p>
      ) : mandates.length === 0 ? (
        <div className={s.empty}>
          <h2>No mandates yet</h2>
          <p>Write what your agent may buy, review each term and sign. Your mandates and their receipts appear here.</p>
          <ButtonLink href="/mandates/new">Create a Mandate</ButtonLink>
        </div>
      ) : (
        <>
          <div role="group" aria-label="Filter mandates" className={s.filters}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={s.filter} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} <span className={s.count}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className={s.body}>
            <section aria-labelledby="list" className={s.listCol}>
              <h2 id="list" className="visually-hidden">
                Mandates
              </h2>
              {shown.length ? (
                <ul className={s.list}>
                  {shown.map((m) => {
                    const tag = tagFor(m);
                    return (
                      <li key={m.code}>
                        <button type="button" className={s.item} aria-current={selected?.code === m.code ? "true" : undefined} onClick={() => select(m.code)}>
                          <span className={s.itemTop}>
                            <span className={s.itemTitle}>{title(m)}</span>
                            <Tag state={tag.state}>{tag.label}</Tag>
                          </span>
                          <span className={s.itemSub}>{subline(m)}</span>
                          <span className={s.itemCode}>{m.code}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={s.muted}>No mandates in this view.</p>
              )}
            </section>
            {selected ? <Detail key={selected.code} m={selected} onChanged={replace} /> : null}
          </div>
        </>
      )}
    </main>
  );
}
