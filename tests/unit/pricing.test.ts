import { describe, expect, it } from "vitest";
import { computeTotals, formatUsd, type PricedLine, type StorePricing } from "@/lib/pricing";

const outlet: StorePricing = { taxRateBp: 825, shippingCents: 595, freeShippingOverCents: 7500 };
const runningCo: StorePricing = { taxRateBp: 825, shippingCents: 695, freeShippingOverCents: null };
const supply: StorePricing = { taxRateBp: 825, shippingCents: 0, freeShippingOverCents: null };

const line = (priceCents: number, qty = 1): PricedLine => ({ priceCents, qty });

describe("computeTotals", () => {
  it("matches the design: Daily Miler at Sample Sports Outlet is $103.92", () => {
    const t = computeTotals([line(9600)], outlet);
    expect(t).toEqual({ subtotalCents: 9600, shippingCents: 0, taxCents: 792, totalCents: 10392 });
  });

  it("matches the design: Tempo Racer at Demo Shoe Supply is $127.74", () => {
    expect(computeTotals([line(11800)], supply).totalCents).toBe(12774);
  });

  it("charges shipping under the free shipping threshold", () => {
    const t = computeTotals([line(1800)], outlet);
    expect(t.shippingCents).toBe(595);
    expect(t.totalCents).toBe(1800 + 595 + 149);
  });

  it("charges flat shipping where there is no threshold", () => {
    expect(computeTotals([line(10400)], runningCo)).toEqual({
      subtotalCents: 10400,
      shippingCents: 695,
      taxCents: 858,
      totalCents: 11953,
    });
  });

  it("rounds tax half up to the cent", () => {
    // 1 cent * 8.25% = 0.0825 cent -> 0; 6 cents -> 0.495 -> 0; 7 cents -> 0.5775 -> 1
    expect(computeTotals([line(7)], supply).taxCents).toBe(1);
    expect(computeTotals([line(6)], supply).taxCents).toBe(0);
  });

  it("multiplies quantity", () => {
    expect(computeTotals([line(1600, 3)], runningCo).subtotalCents).toBe(4800);
  });

  it("rejects an empty cart and invalid lines", () => {
    expect(() => computeTotals([], supply)).toThrow();
    expect(() => computeTotals([line(-1)], supply)).toThrow();
    expect(() => computeTotals([line(100, 0)], supply)).toThrow();
    expect(() => computeTotals([line(10.5)], supply)).toThrow();
  });
});

describe("formatUsd", () => {
  it("formats cents", () => {
    expect(formatUsd(10392)).toBe("$103.92");
    expect(formatUsd(12000)).toBe("$120.00");
    expect(formatUsd(-774)).toBe("-$7.74");
  });
});
