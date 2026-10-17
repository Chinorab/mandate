/**
 * The signed terms of a mandate. Every rule term is checked by code (constitution II); only
 * `semantic` entries are judged by the model, and those can only add a failure.
 */
import { z } from "zod";
import { CATEGORIES, COLOR_IDS, SIZE_SYSTEMS, STORES } from "@/lib/catalog/data";

const categoryIds = Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]];
const storeIds = STORES.map((s) => s.id) as [string, ...string[]];

export const colorIdSchema = z.enum(COLOR_IDS);
export const categoryIdSchema = z.enum(categoryIds);
export const storeIdSchema = z.enum(storeIds);

export const termsSchema = z
  .object({
    /** Maximum total charged across all purchases under the mandate, tax and shipping included. */
    budgetCents: z.number().int().positive().max(1_000_000),
    currency: z.literal("USD"),
    category: categoryIdSchema,
    required: z
      .object({
        size: z.object({ system: z.enum(SIZE_SYSTEMS), value: z.string().min(1).max(8) }).strict().optional(),
        /** Allow list: every color of the product must be in it. */
        colors: z.array(colorIdSchema).max(COLOR_IDS.length).optional(),
      })
      .strict(),
    forbidden: z
      .object({
        colors: z.array(colorIdSchema).max(COLOR_IDS.length).optional(),
        brands: z.array(z.string().min(1).max(60)).max(20).optional(),
      })
      .strict(),
    semantic: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]{1,40}$/),
            label: z.string().min(1).max(60),
            text: z.string().min(1).max(200),
          })
          .strict(),
      )
      .max(5),
    merchants: z.union([z.literal("ANY_LISTED"), z.array(storeIdSchema).min(1)]),
    expiresAt: z.iso.datetime({ offset: true }),
    maxPurchases: z.number().int().min(1).max(20),
  })
  .strict();

export type Terms = z.infer<typeof termsSchema>;

export const assumptionSchema = z
  .object({ term: z.string().min(1).max(40), text: z.string().min(1).max(200) })
  .strict();
export type Assumption = z.infer<typeof assumptionSchema>;

/** Parses and normalizes terms so that equivalent terms always serialize to the same bytes. */
export function parseTerms(input: unknown): Terms {
  return normalizeTerms(termsSchema.parse(input));
}

function sortedUnique<T extends string>(xs: T[] | undefined): T[] | undefined {
  if (!xs || xs.length === 0) return undefined;
  return [...new Set(xs)].sort();
}

export function normalizeTerms(t: Terms): Terms {
  return {
    budgetCents: t.budgetCents,
    currency: t.currency,
    category: t.category,
    required: {
      ...(t.required.size ? { size: { system: t.required.size.system, value: t.required.size.value.trim() } } : {}),
      ...(sortedUnique(t.required.colors) ? { colors: sortedUnique(t.required.colors) } : {}),
    },
    forbidden: {
      ...(sortedUnique(t.forbidden.colors) ? { colors: sortedUnique(t.forbidden.colors) } : {}),
      ...(sortedUnique(t.forbidden.brands) ? { brands: sortedUnique(t.forbidden.brands) } : {}),
    },
    semantic: [...t.semantic].sort((a, b) => a.id.localeCompare(b.id)),
    merchants: t.merchants === "ANY_LISTED" ? "ANY_LISTED" : (sortedUnique(t.merchants) ?? []),
    expiresAt: new Date(t.expiresAt).toISOString(),
    maxPurchases: t.maxPurchases,
  };
}
