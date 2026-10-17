"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import s from "./shell.module.css";

/** Marks the current section with aria-current so the active tab is announced, not only drawn. */
export function NavLink({ href, children, exact = false }: { href: string; children: ReactNode; exact?: boolean }) {
  const pathname = usePathname();
  const current = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className={s.navLink} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
