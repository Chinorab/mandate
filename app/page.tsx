/**
 * Landing (design/project/Main.dc.html, US7): the claim, the example mandate, and the gap it answers,
 * each statement linked to its source (lib/landing/content.ts). Static: no session data is read here.
 */
import type { Metadata } from "next";
import { PageFrame, PublicHeader } from "@/components/shell/Shell";
import { ButtonLink } from "@/components/ui/Button";
import { StateIcon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/Tag";
import { COLOR_LABELS } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS, formatEt, orList } from "@/lib/check/explain";
import { longEt, shortId } from "@/lib/disputes/format";
import { CLAIMS, COST_STAT, EXAMPLE, NYDFS_QUOTE, SOURCES, sourceLabel, type SourceId } from "@/lib/landing/content";
import { formatUsd } from "@/lib/pricing";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: { absolute: "Mandate: proof of what your agent was allowed to buy" },
  description:
    "Write a mandate in plain words. Your shopping agent buys only inside it, every PayPal payment carries the signed record, and merchants answer disputes with it.",
};

function SourceLink({ id }: { id: SourceId }) {
  return (
    <a href={SOURCES[id].url} className={s.source} rel="noreferrer" target="_blank">
      {sourceLabel(id)}
      <span className="visually-hidden">, opens in a new tab</span>
    </a>
  );
}

function ExampleMandate() {
  const t = EXAMPLE.terms;
  const size = t.required.size ? `${SIZE_SYSTEM_LABELS[t.required.size.system]} ${t.required.size.value}` : null;
  const colors = t.required.colors?.length ? orList(t.required.colors.map((c) => COLOR_LABELS[c].toLowerCase())) : null;
  return (
    <figure className={s.figure} aria-label="Example mandate">
      <div className={s.mandate}>
        <div className={s.mandateHead}>
          <div className={s.stack}>
            <span className={s.label}>Mandate</span>
            <span className="mono">{EXAMPLE.code}</span>
          </div>
          <Tag state="active">Signed</Tag>
        </div>
        <p className={s.instructions}>&ldquo;{EXAMPLE.instructions}&rdquo;</p>
        <div className={s.budget}>
          <span className={s.label}>Budget, total for the mandate</span>
          <span className={`${s.amount} num`}>{formatUsd(t.budgetCents)}</span>
        </div>
        <dl className={s.terms}>
          <div>
            <dt>Category</dt>
            <dd>Running shoes</dd>
          </div>
          <div>
            <dt>Constraints</dt>
            <dd>{[size, colors].filter(Boolean).join(", ")}</dd>
          </div>
          <div>
            <dt>Merchants</dt>
            <dd>Any of the 3 demo stores</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd className="num">{formatEt(new Date(t.expiresAt))}</dd>
          </div>
        </dl>
        <div className={s.mandateFoot}>
          <span className="num">Signed {longEt(new Date(EXAMPLE.signedAt))}</span>
          <span className="mono" title={`SHA256 ${EXAMPLE.sha256}`}>
            SHA256 {shortId(EXAMPLE.sha256)}
          </span>
        </div>
      </div>
      <figcaption className={s.caption}>Example mandate. Products and stores in this demo are fictional.</figcaption>
    </figure>
  );
}

const STEPS = [
  {
    icon: "edit" as const,
    title: "The buyer signs a mandate",
    text: "Plain words become terms: budget, category, sizes and colors, stores, expiry, number of orders. Signing fixes them with a SHA256 fingerprint and a timestamp.",
  },
  {
    icon: "active" as const,
    title: "Every payment is checked first",
    text: "Before PayPal is asked to move money, the cart is checked against every term by code. A cart outside the mandate is blocked, and only the buyer can widen the mandate, with a new signature.",
  },
  {
    icon: "dispute" as const,
    title: "A dispute gets the record",
    text: "When a buyer disputes an agent order, the merchant gets an evidence file built from the signed mandate, the check and the order, reviews the response and submits it to PayPal.",
  },
];

export default function Home() {
  return (
    <PageFrame header={<PublicHeader />}>
      <main id="main" className={s.main}>
        <section className={s.hero}>
          <div className={s.heroText}>
            <h1 className={s.title}>Proof of what your agent was allowed to buy.</h1>
            <p className={s.lede}>Write a mandate in plain words. Your agent shops inside it, and every PayPal payment carries the record.</p>
            <div className={s.actions}>
              <ButtonLink href="/mandates/new">
                Create a Mandate
                <StateIcon name="next" size={18} />
              </ButtonLink>
            </div>
          </div>
          <ExampleMandate />
        </section>

        <section aria-label="Context" className={s.strip}>
          <div className={s.stripInner} data-claim>
            <StateIcon name="info" size={20} />
            <p>
              {NYDFS_QUOTE.lead} &ldquo;{NYDFS_QUOTE.text}&rdquo; <SourceLink id={NYDFS_QUOTE.source} />
            </p>
          </div>
        </section>

        <section aria-labelledby="gap" className={s.section}>
          <div className={s.sectionHead}>
            <h2 id="gap">Agent purchases have no liability rule yet</h2>
            <p>Shopping agents already pay on behalf of people. When one of those purchases is disputed, this is where things stand.</p>
          </div>
          <div className={s.gap}>
            <div className={s.stat} data-claim>
              <span className={s.label}>Cost of chargebacks to merchants, worldwide</span>
              <p className={`${s.statFigures} num`}>
                <span>
                  {COST_STAT.from} <small>in {COST_STAT.fromYear}</small>
                </span>
                <span>
                  <StateIcon name="next" size={26} />
                  {COST_STAT.to} <small>in {COST_STAT.toYear}</small>
                </span>
              </p>
              <p className={s.statCaption}>
                {COST_STAT.caption} Figures from {COST_STAT.measuredBy}, as reported by <SourceLink id={COST_STAT.source} />
              </p>
            </div>
            <ol className={s.claims}>
              {CLAIMS.map((c) => (
                <li key={c.title} className={s.claim} data-claim>
                  <h3>{c.title}</h3>
                  <p>
                    {c.text} <SourceLink id={c.source} />
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="how" className={s.section}>
          <div className={s.sectionHead}>
            <h2 id="how">How Mandate answers it</h2>
            <p>One signed record follows the purchase from the buyer&apos;s words to the merchant&apos;s dispute response.</p>
          </div>
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.step}>
                <span className={s.stepIcon}>
                  <StateIcon name={st.icon} size={20} />
                </span>
                <span className={`${s.stepNo} num`}>{i + 1}</span>
                <h3>{st.title}</h3>
                <p>{st.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="try" className={`${s.section} ${s.try}`}>
          <div className={s.sectionHead}>
            <h2 id="try">Try it without signing up</h2>
            <p>
              Each visitor gets a private demo session: your mandates are visible to you only. Payments run in the PayPal sandbox, so no real money
              moves. Switch to the merchant side at any time to see agent orders and answer a dispute.
            </p>
          </div>
          <div className={s.actions}>
            <ButtonLink href="/mandates/new">
              Create a Mandate
              <StateIcon name="next" size={18} />
            </ButtonLink>
            <ButtonLink href="/merchant" variant="secondary">
              Open the Merchant View
            </ButtonLink>
          </div>
        </section>
      </main>
    </PageFrame>
  );
}
