import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import s from "./ui.module.css";

type Variant = "primary" | "secondary" | "danger" | "link";
type Size = "md" | "sm";

function cls(variant: Variant, size: Size, extra?: string) {
  return [s.btn, s[variant], size === "sm" ? s.sm : "", extra ?? ""].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={cls(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cls(variant, size, className)} {...rest} />;
}

/** Icon only button: the label is required so screen readers announce it. */
export function IconButton({
  label,
  children,
  type = "button",
  ...rest
}: Omit<ComponentProps<"button">, "aria-label"> & { label: string; children: ReactNode }) {
  return (
    <button type={type} aria-label={label} className={s.iconBtn} {...rest}>
      {children}
    </button>
  );
}
