"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import s from "./shell.module.css";

type Props = { href: string; children: ReactNode; exact?: boolean };

function CurrentAware({ href, children, exact = false }: Props) {
  const pathname = usePathname();
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={s.navLink} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}

/**
 * Marks the current section with aria-current so the active tab is announced, not only drawn.
 * The pathname is runtime data on dynamic routes, so it streams in behind a plain link.
 */
export function NavLink(props: Props) {
  return (
    <Suspense
      fallback={
        <Link href={props.href} className={s.navLink}>
          {props.children}
        </Link>
      }
    >
      <CurrentAware {...props} />
    </Suspense>
  );
}
