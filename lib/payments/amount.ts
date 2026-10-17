/** Integer cents to the PayPal amount string ("103.92"). */
export function formatAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error("Amount must be non negative integer cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
