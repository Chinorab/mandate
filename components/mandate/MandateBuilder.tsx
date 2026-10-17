"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, IconButton } from "@/components/ui/Button";
import { MonoId } from "@/components/ui/Data";
import { StateIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/Tag";
import { CATEGORIES, COLOR_LABELS, STORES, type CategoryId } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS, formatEt } from "@/lib/check/explain";
import { ApiCallError, mandateApi, type DraftTerms, type MandateView } from "@/lib/client/api";
import { formatUsd } from "@/lib/pricing";
import { LinkPayPal } from "./LinkPayPal";
import {
  BudgetEditor,
  CategoryEditor,
  ColorsEditor,
  ExpiresEditor,
  MerchantsEditor,
  PurchasesEditor,
  SizeEditor,
  type TermKey,
} from "./TermEditors";
import s from "./builder.module.css";

export const EXAMPLE = "Buy running shoes, size 10, under $120, neutral colors, this week only";
const SIZED: CategoryId[] = ["running-shoes", "trail-shoes", "kids-rain-boots"];

const ASSUMPTION_FOR: Record<TermKey, string> = {
  budget: "budgetCents",
  category: "category",
  size: "size",
  colors: "colors",
  purchases: "maxPurchases",
  merchants: "merchants",
  expires: "expiresAt",
};

function Note({ kind, children }: { kind: "assumption" | "missing"; children: React.ReactNode }) {
  return (
    <span className={kind === "assumption" ? s.assumption : s.missing}>
      <StateIcon name={kind === "assumption" ? "info" : "warning"} size={16} />
      {children}
    </span>
  );
}

function colorsText(t: DraftTerms) {
  const allowed = t.required?.colors;
  const excluded = t.forbidden?.colors;
  const names = (ids: string[]) =>
    ids
      .map((c, i) =>
        i === 0
          ? COLOR_LABELS[c as keyof typeof COLOR_LABELS]
          : COLOR_LABELS[c as keyof typeof COLOR_LABELS].toLowerCase(),
      )
      .join(", ");
  return {
    main: allowed?.length ? names(allowed) : "Any color",
    sub: excluded?.length ? `Excludes ${names(excluded).toLowerCase()}` : null,
  };
}

function merchantsText(t: DraftTerms) {
  if (!t.merchants || t.merchants === "ANY_LISTED") return "Any of the 3 demo stores";
  return t.merchants.map((id) => STORES.find((x) => x.id === id)?.name ?? id).join(", ");
}

const EDITORS: Record<TermKey, typeof BudgetEditor> = {
  budget: BudgetEditor,
  category: CategoryEditor,
  size: SizeEditor,
  colors: ColorsEditor,
  purchases: PurchasesEditor,
  merchants: MerchantsEditor,
  expires: ExpiresEditor,
};

type RowProps = {
  k: TermKey;
  label: string;
  children: React.ReactNode;
  terms: DraftTerms;
  open: boolean;
  editable: boolean;
  busy: boolean;
  assumption?: string;
  onEdit: (k: TermKey) => void;
  onSave: (t: DraftTerms) => void;
  onCancel: () => void;
};

function Row({
  k,
  label,
  children,
  terms,
  open,
  editable,
  busy,
  assumption,
  onEdit,
  onSave,
  onCancel,
}: RowProps) {
  const Editor = EDITORS[k];
  return (
    <div className={`${s.row} ${open ? s.rowEditing : ""}`}>
      <dt>{label}</dt>
      <dd>
        {open ? (
          <Editor terms={terms} busy={busy} onSave={onSave} onCancel={onCancel} />
        ) : (
          <>
            {children}
            {assumption ? <Note kind="assumption">{assumption}</Note> : null}
          </>
        )}
      </dd>
      {editable && !open ? (
        <IconButton label={`Edit ${label.toLowerCase()}`} onClick={() => onEdit(k)} disabled={busy}>
          <StateIcon name="edit" size={16} />
        </IconButton>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}

export function MandateBuilder() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const codeParam = params.get("code");

  const [instructions, setInstructions] = useState("");
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [editing, setEditing] = useState<TermKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; canFillByHand?: boolean } | null>(null);
  const [loaded, setLoaded] = useState(!codeParam);

  // Restore the mandate in progress after a reload or a return from PayPal.
  useEffect(() => {
    if (!codeParam || mandate?.code === codeParam) return;
    mandateApi
      .get(codeParam)
      .then((r) => {
        setMandate(r.mandate);
        setInstructions(r.mandate.instructions);
      })
      .catch(() => router.replace(pathname))
      .finally(() => setLoaded(true));
  }, [codeParam, mandate?.code, pathname, router]);

  const show = useCallback(
    (m: MandateView) => {
      setMandate(m);
      setEditing(null);
      setError(null);
      if (params.get("code") !== m.code) router.replace(`${pathname}?code=${m.code}`);
    },
    [params, pathname, router],
  );

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiCallError) {
        setError({
          message: e.message,
          canFillByHand:
            e.code.includes("cap") || e.code.includes("not_configured") || e.status === 503,
        });
      } else setError({ message: "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const draftTerms = () =>
    run(async () => {
      const r = mandate
        ? await mandateApi.redraft(mandate.code, instructions)
        : await mandateApi.draft(instructions);
      show(r.mandate);
    });
  const fillByHand = () =>
    run(async () => {
      const text = instructions.trim() || "Terms entered by hand";
      show((await mandateApi.draft(text, true)).mandate);
    });
  const saveTerms = (next: DraftTerms) =>
    run(async () => show((await mandateApi.update(mandate!.code, next)).mandate));
  const sign = () => run(async () => show((await mandateApi.sign(mandate!.code)).mandate));
  const discard = () =>
    run(async () => {
      await mandateApi.discard(mandate!.code);
      setMandate(null);
      setInstructions("");
      router.replace(pathname);
    });
  const onLinked = useCallback((m: MandateView) => show(m), [show]);

  if (!loaded) return <p className={s.linkState}>Loading your mandate.</p>;

  const isDraft = !mandate || mandate.status === "draft";
  const t = mandate?.terms;
  const assumed = (k: TermKey) =>
    mandate?.assumptions.find((a) => a.term === ASSUMPTION_FOR[k])?.text;
  const missing = new Set(mandate?.missing ?? []);

  const rowProps = (k: TermKey) => ({
    k,
    terms: t!,
    open: editing === k,
    editable: isDraft,
    busy,
    assumption: assumed(k),
    onEdit: setEditing,
    onSave: saveTerms,
    onCancel: () => setEditing(null),
  });
  const colors = t ? colorsText(t) : null;
  const sized = t?.category && SIZED.includes(t.category);

  return (
    <div className={s.layout}>
      <section aria-labelledby="describe" className={s.left}>
        <h2 id="describe" className={s.sectionTitle}>
          Instructions
        </h2>
        {isDraft ? (
          <>
            <div className={s.field}>
              <label htmlFor="instr" className={s.label}>
                What may your agent buy?
              </label>
              <textarea
                id="instr"
                name="instructions"
                rows={5}
                className={s.textarea}
                value={instructions}
                maxLength={1000}
                onChange={(e) => setInstructions(e.target.value)}
              />
              <span className={s.help}>
                Include a budget, what to buy, and when it should stop.
              </span>
            </div>
            <div className={s.actions}>
              {mandate ? (
                <Button
                  variant="secondary"
                  onClick={draftTerms}
                  disabled={busy || !instructions.trim()}
                >
                  Update Terms
                </Button>
              ) : (
                <Button onClick={draftTerms} disabled={busy || !instructions.trim()}>
                  Draft Terms
                </Button>
              )}
              {!instructions.trim() ? (
                <Button
                  variant="secondary"
                  onClick={() => setInstructions(EXAMPLE)}
                  disabled={busy}
                >
                  Use the Example
                </Button>
              ) : null}
              {!mandate ? (
                <Button
                  variant="link"
                  onClick={fillByHand}
                  disabled={busy}
                  style={{ color: "var(--ink-2)" }}
                >
                  Fill In the Terms Myself
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <blockquote className={s.quote}>{`“${mandate.instructions}”`}</blockquote>
        )}
        {error ? (
          <div className={s.alert} role="alert">
            <StateIcon name="warning" size={16} />
            <span>
              {error.message}{" "}
              {error.canFillByHand && !mandate ? (
                <>
                  You can still set the terms yourself.{" "}
                  <button
                    type="button"
                    onClick={fillByHand}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "inherit",
                      textDecoration: "underline",
                    }}
                  >
                    Fill in the terms myself
                  </button>
                </>
              ) : null}
            </span>
          </div>
        ) : null}
        <div className={s.note}>
          <StateIcon name="active" size={20} />
          <span>
            Your agent cannot reach payment unless the cart passes every term. You can revoke this
            mandate at any time.
          </span>
        </div>
      </section>

      <section aria-labelledby="card-title" className={s.right}>
        <div className={s.card}>
          {!mandate || !t ? (
            <div className={s.empty}>
              <h2 id="card-title">Mandate terms</h2>
              <p style={{ margin: 0 }}>
                Your terms appear here, one by one, before anything is signed.
              </p>
            </div>
          ) : (
            <>
              <div className={s.cardHead}>
                <div className={s.cardTitle}>
                  <h2 id="card-title">Mandate terms</h2>
                  <span className={s.code}>
                    {mandate.status === "draft" ? "Draft " : ""}
                    {mandate.code}
                  </span>
                </div>
                {mandate.status === "draft" ? (
                  <Tag state="awaiting">Awaiting your signature</Tag>
                ) : mandate.status === "awaiting_link" ? (
                  <Tag state="awaiting">Signed, link PayPal</Tag>
                ) : mandate.status === "active" ? (
                  <Tag state="active" />
                ) : (
                  <Tag state={mandate.status === "revoked" ? "revoked" : "expired"} />
                )}
              </div>

              {editing === "budget" ? (
                <div className={`${s.budget} ${s.rowEditing}`}>
                  <BudgetEditor
                    terms={t}
                    busy={busy}
                    onSave={saveTerms}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : (
                <div className={s.budget}>
                  <div className={s.budgetValue}>
                    <span className={s.caption}>Budget</span>
                    <span className={s.amount}>
                      {t.budgetCents !== undefined ? formatUsd(t.budgetCents) : "Not set"}
                    </span>
                    <span className={s.sub}>
                      Maximum total for this mandate, tax and shipping included
                    </span>
                    {missing.has("budgetCents") ? (
                      <Note kind="missing">Add a budget before signing.</Note>
                    ) : null}
                  </div>
                  {isDraft ? (
                    <IconButton
                      label="Edit budget"
                      onClick={() => setEditing("budget")}
                      disabled={busy}
                    >
                      <StateIcon name="edit" size={18} />
                    </IconButton>
                  ) : null}
                </div>
              )}

              <dl className={s.terms}>
                <Row {...rowProps("category")} label="Category">
                  <span>{t.category ? CATEGORIES[t.category] : "Not set"}</span>
                  {missing.has("category") ? (
                    <Note kind="missing">Choose what your agent may buy.</Note>
                  ) : null}
                </Row>
                {sized || t.required?.size ? (
                  <Row {...rowProps("size")} label="Size">
                    <span>
                      {t.required?.size
                        ? `${SIZE_SYSTEM_LABELS[t.required.size.system]} ${t.required.size.value}`
                        : "Any size"}
                    </span>
                  </Row>
                ) : null}
                <Row {...rowProps("colors")} label="Colors">
                  <span>{colors!.main}</span>
                  {colors!.sub ? <span className={s.secondary}>{colors!.sub}</span> : null}
                </Row>
                <Row {...rowProps("purchases")} label="Orders">
                  <span className="num">
                    {t.maxPurchases === 1 ? "1 order" : `${t.maxPurchases ?? 1} orders`}
                  </span>
                </Row>
                <Row {...rowProps("merchants")} label="Allowed merchants">
                  <span>{merchantsText(t)}</span>
                </Row>
                <Row {...rowProps("expires")} label="Expires">
                  <span className="num">
                    {t.expiresAt ? formatEt(new Date(t.expiresAt)) : "Not set"}
                  </span>
                  {missing.has("expiresAt") ? (
                    <Note kind="missing">Choose when this mandate stops.</Note>
                  ) : null}
                </Row>
                {t.semantic?.length ? (
                  <div className={s.row}>
                    <dt>Preferences</dt>
                    <dd>
                      {t.semantic.map((p) => (
                        <span key={p.id}>{p.text}</span>
                      ))}
                      <span className={s.secondary}>
                        Judged for each cart. If it cannot be judged, the cart does not pass.
                      </span>
                    </dd>
                    <span aria-hidden="true" />
                  </div>
                ) : null}
              </dl>

              {mandate.status === "draft" ? (
                <div className={s.foot}>
                  <Button variant="link" onClick={discard} disabled={busy}>
                    Discard Draft
                  </Button>
                  <Button
                    onClick={sign}
                    disabled={
                      busy || missing.size > 0 || Boolean(mandate.outOfScope) || editing !== null
                    }
                  >
                    <StateIcon name="edit" size={18} />
                    Sign Mandate
                  </Button>
                  {mandate.outOfScope ? <Note kind="missing">{mandate.outOfScope}</Note> : null}
                </div>
              ) : (
                <div className={`${s.foot} ${s.footStack}`}>
                  {mandate.status === "awaiting_link" ? (
                    <>
                      <p style={{ margin: 0 }}>
                        Link PayPal once. Your agent can then pay inside this mandate, and nowhere
                        else.
                      </p>
                      <LinkPayPal code={mandate.code} onLinked={onLinked} />
                    </>
                  ) : mandate.status === "active" ? (
                    <div className={s.actions} style={{ justifyContent: "space-between" }}>
                      <span>Your agent can shop inside this mandate now.</span>
                      <Link href={`/mandates/${mandate.code}`} style={{ fontWeight: 500 }}>
                        Open Shopping Agent
                      </Link>
                    </div>
                  ) : null}
                  {mandate.version ? (
                    <div className={s.footMeta}>
                      <span>Signed {formatEt(new Date(mandate.version.signedAt))}</span>
                      <span>
                        SHA256 <MonoId value={mandate.version.sha256} short />
                      </span>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
