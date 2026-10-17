/**
 * One icon family (Phosphor, regular weight) for the whole app. Each state of the design system
 * maps to one glyph so status is never conveyed by color alone (System board, "States").
 * The ssr entry renders in both server and client components.
 */
import {
  ArrowLeft,
  ArrowRight,
  Robot,
  Sneaker,
  CheckCircle,
  CheckSquare,
  Clock,
  DownloadSimple,
  Flag,
  Info,
  MinusCircle,
  Octagon,
  PencilSimple,
  Prohibit,
  ShieldCheck,
  Warning,
  X,
} from "@phosphor-icons/react/ssr";
import type { IconProps } from "@phosphor-icons/react";

export type { IconProps };

export const Icon = {
  compliant: CheckCircle,
  blocked: Octagon,
  dispute: Flag,
  resolved: CheckSquare,
  awaiting: Clock,
  active: ShieldCheck,
  expired: Clock,
  revoked: Prohibit,
  info: Info,
  warning: Warning,
  fail: MinusCircle,
  edit: PencilSimple,
  next: ArrowRight,
  back: ArrowLeft,
  agent: Robot,
  product: Sneaker,
  download: DownloadSimple,
  close: X,
} as const;

export type IconName = keyof typeof Icon;

/** Decorative by default: pass a label to expose it to assistive tech. */
export function StateIcon({
  name,
  size = 16,
  label,
  ...rest
}: { name: IconName; size?: number; label?: string } & Omit<IconProps, "size">) {
  const Glyph = Icon[name];
  return (
    <Glyph
      size={size}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable={false}
      {...rest}
    />
  );
}
