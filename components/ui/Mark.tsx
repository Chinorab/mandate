/**
 * The Mandate mark from the System board: a check above a signature line, approved then signed.
 * A single geometric brand mark, not an icon, so it is drawn here rather than taken from Phosphor.
 */
export function Mark({ size = 24, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="24" height="24" rx="4" fill="var(--ink)" />
      <path
        d="M6.5 11.2l3.2 3.2L17.5 6.6"
        stroke="var(--surface)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.5 18h11" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
