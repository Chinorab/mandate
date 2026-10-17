/**
 * US Eastern time helpers (Intl only, safe in the browser and on the server).
 * Mandate expiries are shown and entered in ET and stored as UTC instants.
 */

const OFFSET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "longOffset" });
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
  weekday: "short",
});

function offsetMinutes(at: Date): number {
  const name = OFFSET.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : -300;
}

/** The UTC instant of a wall clock time in New York. */
export function etWallToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - offsetMinutes(new Date(guess)) * 60_000);
}

/** 11:59 PM in New York on the given calendar day. */
export function endOfDayEt(y: number, m: number, d: number): Date {
  return etWallToUtc(y, m, d, 23, 59);
}

export type EtParts = { y: number; m: number; d: number; h: number; min: number; weekday: number };

export function etParts(at: Date): EtParts {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((x) => [x.type, x.value]));
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    h: Number(p.hour),
    min: Number(p.minute),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Values for <input type="date"> and <input type="time"> in ET. */
export function toEtInputs(iso: string): { date: string; time: string } {
  const p = etParts(new Date(iso));
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.min)}` };
}

export function fromEtInputs(date: string, time: string): string | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{2}):(\d{2})$/);
  if (!dm || !tm) return null;
  return etWallToUtc(Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])).toISOString();
}
