import type { Metadata } from "next";
import { PageFrame, PublicHeader, REPO_URL } from "@/components/shell/Shell";
import s from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Mandate records when you authorize an agent to shop for you, and what happens to that record.",
};

const SECTIONS = [
  ["collect", "What we collect"],
  ["use", "How we use it"],
  ["share", "Who can see it"],
  ["keep", "How long we keep it"],
  ["rights", "Your choices and rights"],
  ["security", "Security"],
  ["contact", "Contact"],
] as const;

export default function PrivacyPage() {
  return (
    <PageFrame header={<PublicHeader />}>
      <main id="main" className={s.layout}>
        <nav aria-label="On this page" className={s.toc}>
          <span className={s.tocTitle}>On this page</span>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>

        <article className={s.article}>
          <div className={s.intro}>
            <h1>Privacy policy</h1>
            <p>
              Last updated October 17, 2026. This policy explains what Mandate records when you authorize an
              agent to shop for you, and what happens to that record. Mandate is a demo that runs in the
              PayPal sandbox: no real money moves and every store in it is fictional.
            </p>
          </div>

          <section aria-labelledby="collect">
            <h2 id="collect">What we collect</h2>
            <ul>
              <li>
                <strong>A demo session.</strong> A signed cookie that keeps your mandates private to your browser.
                There are no accounts, so we do not ask for your name or email.
              </li>
              <li>
                <strong>Mandates.</strong> The instructions you write, the terms you sign, the time you signed, any
                changes you approve, and a fingerprint of the signed record.
              </li>
              <li>
                <strong>Checks.</strong> Each cart your agent submits, the result for every term, and when the check
                ran.
              </li>
              <li>
                <strong>Order references.</strong> The PayPal order and transaction IDs, amount, store and order
                status for purchases made under a mandate.
              </li>
              <li>
                <strong>A PayPal payment reference.</strong> When you link PayPal to a mandate, PayPal gives us a
                token that lets your agent pay inside that mandate. It is stored on our server only and deleted
                when you revoke the mandate.
              </li>
            </ul>
            <p>We never receive your card or bank details. Payment happens inside PayPal.</p>
          </section>

          <section aria-labelledby="use">
            <h2 id="use">How we use it</h2>
            <ul>
              <li>To stop a purchase before payment when it falls outside your mandate.</li>
              <li>To give you receipts and a history of what your agent did.</li>
              <li>To let a merchant answer a dispute with the records for that order.</li>
              <li>To keep the service secure and to limit abuse of the demo.</li>
            </ul>
          </section>

          <section aria-labelledby="share">
            <h2 id="share">Who can see it</h2>
            <ul>
              <li>
                <strong>You</strong>, for every mandate and check made in your session.
              </li>
              <li>
                <strong>The merchant</strong> of an order, for the mandate and check attached to that order only,
                with your identity masked.
              </li>
              <li>
                <strong>PayPal</strong>, which processes your payment under its own privacy statement.
              </li>
              <li>
                <strong>Anthropic</strong>, which runs the model that reads your instructions to draft the terms and
                helps the shopping agent and the merchant. It receives the text needed for each request.
              </li>
              <li>
                <strong>Render</strong>, which hosts the app and its database.
              </li>
            </ul>
            <p>We do not sell your personal information or share it for targeted advertising.</p>
          </section>

          <section aria-labelledby="keep">
            <h2 id="keep">How long we keep it</h2>
            <p>
              We keep mandates, checks and order references for 90 days after a mandate expires or is revoked, so
              the record is available if a dispute is opened. After that we delete it.
            </p>
          </section>

          <section aria-labelledby="rights">
            <h2 id="rights">Your choices and rights</h2>
            <ul>
              <li>Revoke any mandate at any time. Your agent stops immediately.</li>
              <li>Download the receipt for any mandate.</li>
              <li>Clear the cookie for this site to start a new, empty session.</li>
              <li>Ask us to delete the records of a mandate by giving its code (for example MDT4K7Q21).</li>
            </ul>
            <p>
              Depending on the state you live in, you may have additional rights under state privacy laws. We will
              not treat you differently for using them. Mandate is not intended for anyone under 18.
            </p>
          </section>

          <section aria-labelledby="security">
            <h2 id="security">Security</h2>
            <p>
              Signed mandates are fingerprinted so any later change is detectable. Connections use HTTPS, and API
              keys stay on our server. No method is perfect, and we will notify you of a breach as the law requires.
            </p>
          </section>

          <section aria-labelledby="contact">
            <h2 id="contact">Contact</h2>
            <p>
              Open an issue on the <a href={`${REPO_URL}/issues`}>Mandate repository</a> with the mandate code. Do
              not post personal details there; we will reply with a private way to continue.
            </p>
            <p>If we change this policy in a way that matters, we will say so on this page before the change applies.</p>
          </section>
        </article>
      </main>
    </PageFrame>
  );
}
