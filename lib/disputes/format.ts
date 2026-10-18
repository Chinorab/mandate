/** Wording shared by the evidence file, the draft, the dispute page and the evidence report. */

const LONG = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

/** "Oct 19, 2026, 9:02 AM ET" (disputes are read weeks later, so the year is kept). */
export function longEt(d: Date): string {
  return `${LONG.format(d)} ET`;
}

/** "Oct 19, 9:14 AM ET" */
export function shortEt(d: Date): string {
  return `${SHORT.format(d)} ET`;
}

/** "Nov 13, 2026" */
export function dayEt(d: Date): string {
  return DAY.format(d);
}

const REASONS: Record<string, string> = {
  UNAUTHORISED: "Unauthorized transaction",
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Item not as described",
  CREDIT_NOT_PROCESSED: "Credit not processed",
  DUPLICATE_TRANSACTION: "Duplicate transaction",
  INCORRECT_AMOUNT: "Incorrect amount",
  PAYMENT_BY_OTHER_MEANS: "Paid by other means",
  CANCELED_RECURRING_BILLING: "Canceled recurring billing",
  PROBLEM_WITH_REMITTANCE: "Problem with remittance",
  OTHER: "Other",
};

const CLAIMS: Record<string, string> = {
  UNAUTHORISED: "The buyer reports this purchase as unauthorized.",
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "The buyer reports the item was not received.",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "The buyer reports the item was not as described.",
  CREDIT_NOT_PROCESSED: "The buyer reports a refund was not processed.",
  DUPLICATE_TRANSACTION: "The buyer reports a duplicate charge.",
  INCORRECT_AMOUNT: "The buyer reports an incorrect amount.",
};

/** One sentence for what the buyer claims. */
export function reasonClaim(code: string | null): string {
  return (code && CLAIMS[code]) || `The buyer opened a dispute: ${reasonLabel(code).toLowerCase()}.`;
}

export function reasonLabel(code: string | null): string {
  if (!code) return "Not given";
  return REASONS[code] ?? code.charAt(0) + code.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "8XK2…41QD" for long PayPal ids in compact places. */
export function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

/** Dollar string ("103.92") to integer cents, or null when it is not a plain amount. */
export function toCents(value: string | undefined | null): number | null {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
