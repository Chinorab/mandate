import Link from "next/link";
import type { ReactNode } from "react";
import { Mark } from "@/components/ui/Mark";
import { NavLink } from "./NavLink";
import s from "./shell.module.css";

export const REPO_URL = "https://github.com/Chinorab/mandate";

function Brand({ area }: { area?: string }) {
  return (
    <Link href="/" className={s.brand} aria-label={area ? `Mandate ${area} home` : "Mandate home"}>
      <Mark />
      <span className={s.wordmark}>Mandate</span>
      {area ? <span className={s.area}>{area}</span> : null}
    </Link>
  );
}

export function SkipLink() {
  return (
    <a href="#main" className={s.skip}>
      Skip to content
    </a>
  );
}

/** Landing and legal pages. */
export function PublicHeader() {
  return (
    <header className={s.header}>
      <div className={`${s.inner} ${s.bar}`}>
        <Brand />
        <nav aria-label="Primary" className={s.right}>
          <Link href="/merchant">For Merchants</Link>
          <Link href="/history">Your Mandates</Link>
        </nav>
      </div>
    </header>
  );
}

/** Buyer area: mandates, history, switch to the merchant view (FR-034). */
export function BuyerHeader() {
  return (
    <header className={s.header}>
      <div className={`${s.inner} ${s.bar}`}>
        <div className={s.left}>
          <Brand />
          <nav aria-label="Primary" className={s.nav}>
            <NavLink href="/mandates">Mandates</NavLink>
            <NavLink href="/history">History</NavLink>
          </nav>
        </div>
        <div className={s.right}>
          <Link href="/merchant">Merchant View</Link>
        </div>
      </div>
    </header>
  );
}

/** Merchant area for the demo store Sample Sports Outlet. */
export function MerchantHeader({ openDisputes }: { openDisputes?: number }) {
  return (
    <header className={`${s.header} ${s.merchantHeader}`}>
      <div className={`${s.inner} ${s.wide} ${s.bar}`}>
        <div className={s.left}>
          <Brand area="Merchant" />
          <nav aria-label="Primary" className={s.nav}>
            <NavLink href="/merchant" exact>
              Orders
            </NavLink>
            <NavLink href="/merchant/disputes">
              Disputes
              {openDisputes ? <span className="num">{openDisputes}</span> : null}
            </NavLink>
            <NavLink href="/merchant/insights">Insights</NavLink>
          </nav>
        </div>
        <div className={s.right}>
          <span className={s.storeName}>Sample Sports Outlet</span>
          <Link href="/mandates">Buyer View</Link>
        </div>
      </div>
    </header>
  );
}

export function Footer({ wide = false }: { wide?: boolean }) {
  return (
    <footer className={s.footer}>
      <div className={`${s.inner} ${wide ? s.wide : ""} ${s.footerBar}`}>
        <span>
          © 2026 Mandate. Sandbox demo, no real money moves. PayPal is a trademark of its owner. Mandate
          is not affiliated with PayPal.
        </span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <a href={REPO_URL}>Source</a>
        </nav>
      </div>
    </footer>
  );
}

export function PageFrame({ header, children, wide }: { header: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <SkipLink />
      {header}
      <div style={{ flex: "1 1 auto" }}>{children}</div>
      <Footer wide={wide} />
    </div>
  );
}
