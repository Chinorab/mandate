/**
 * Fictional demo catalog. Every store, brand and product here is invented for the demo and is
 * labeled as such in the UI. Prices are integer cents. Three running shoes reproduce the design
 * canvas scenario (Daily Miler passes, Road Trainer 4 is close to budget, Tempo Racer is blocked).
 */

export const COLOR_IDS = [
  "black",
  "white",
  "gray",
  "beige",
  "navy",
  "brown",
  "olive",
  "red",
  "orange",
  "volt-yellow",
  "blue",
  "pink",
] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export const COLOR_LABELS: Record<ColorId, string> = {
  black: "Black",
  white: "White",
  gray: "Gray",
  beige: "Beige",
  navy: "Navy",
  brown: "Brown",
  olive: "Olive",
  red: "Red",
  orange: "Orange",
  "volt-yellow": "Volt yellow",
  blue: "Blue",
  pink: "Pink",
};

export const CATEGORIES = {
  "running-shoes": "Running shoes",
  "trail-shoes": "Trail shoes",
  "running-socks": "Running socks",
  "kids-rain-boots": "Kids rain boots",
  "ground-coffee": "Ground coffee",
  "desk-lamp": "Desk lamps",
} as const;
export type CategoryId = keyof typeof CATEGORIES;

export const SIZE_SYSTEMS = ["US_MENS", "US_WOMENS", "US_KIDS"] as const;
export type SizeSystem = (typeof SIZE_SYSTEMS)[number];

export type StoreId = "sports-outlet" | "running-co" | "shoe-supply";

export type StoreSeed = {
  id: StoreId;
  name: string;
  payeeEnv: string;
  taxRateBp: number; // basis points, 825 = 8.25%
  shippingCents: number;
  freeShippingOverCents: number | null;
};

export type ProductAttributes = {
  brand: string;
  colors: ColorId[];
  sizeSystem: SizeSystem | null;
  sizes: string[];
  material?: string;
};

export type ProductSeed = {
  id: string;
  storeId: StoreId;
  name: string;
  category: CategoryId;
  attributes: ProductAttributes;
  priceCents: number;
  stock: number;
  description: string;
};

export const STORES: StoreSeed[] = [
  {
    id: "sports-outlet",
    name: "Sample Sports Outlet",
    payeeEnv: "PAYPAL_MERCHANT_ID_SPORTS_OUTLET",
    taxRateBp: 825,
    shippingCents: 595,
    freeShippingOverCents: 7500,
  },
  {
    id: "running-co",
    name: "Example Running Co.",
    payeeEnv: "PAYPAL_MERCHANT_ID_RUNNING_CO",
    taxRateBp: 825,
    shippingCents: 695,
    freeShippingOverCents: null,
  },
  {
    id: "shoe-supply",
    name: "Demo Shoe Supply",
    payeeEnv: "PAYPAL_MERCHANT_ID_SHOE_SUPPLY",
    taxRateBp: 825,
    shippingCents: 0,
    freeShippingOverCents: null,
  },
];

const MENS = ["8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12"];
const WOMENS = ["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10"];
const KIDS = ["10", "11", "12", "13", "1", "2", "3"];

function shoe(
  id: string,
  storeId: StoreId,
  name: string,
  brand: string,
  colors: ColorId[],
  priceCents: number,
  description: string,
  opts: { category?: CategoryId; sizeSystem?: SizeSystem; stock?: number } = {},
): ProductSeed {
  const sizeSystem = opts.sizeSystem ?? "US_MENS";
  return {
    id,
    storeId,
    name,
    category: opts.category ?? "running-shoes",
    attributes: {
      brand,
      colors,
      sizeSystem,
      sizes: sizeSystem === "US_MENS" ? MENS : sizeSystem === "US_WOMENS" ? WOMENS : KIDS,
      material: "Engineered mesh",
    },
    priceCents,
    stock: opts.stock ?? 12,
    description,
  };
}

function item(
  id: string,
  storeId: StoreId,
  name: string,
  category: CategoryId,
  brand: string,
  colors: ColorId[],
  priceCents: number,
  description: string,
  material?: string,
): ProductSeed {
  return {
    id,
    storeId,
    name,
    category,
    attributes: { brand, colors, sizeSystem: null, sizes: [], material },
    priceCents,
    stock: 20,
    description,
  };
}

export const PRODUCTS: ProductSeed[] = [
  // The three proposals from the design canvas.
  shoe("daily-miler-blk-wht", "sports-outlet", "Daily Miler", "Halden", ["black", "white"], 9600,
    "Neutral daily trainer with a firm foam midsole."),
  shoe("road-trainer-4-gray", "running-co", "Road Trainer 4", "Northline", ["gray"], 10400,
    "Cushioned road shoe for long easy runs. Stone gray."),
  shoe("tempo-racer-volt", "shoe-supply", "Tempo Racer", "Kestrel", ["volt-yellow"], 11800,
    "Light racing flat with a plated midsole."),

  // More running shoes across stores.
  shoe("daily-miler-navy", "sports-outlet", "Daily Miler", "Halden", ["navy", "white"], 9600,
    "Neutral daily trainer, navy colorway."),
  shoe("cadence-2-beige", "sports-outlet", "Cadence 2", "Halden", ["beige"], 8900,
    "Lightweight trainer with a knit upper in sand."),
  shoe("cadence-2-red", "sports-outlet", "Cadence 2", "Halden", ["red"], 8900,
    "Lightweight trainer with a knit upper in red."),
  shoe("long-haul-blk", "running-co", "Long Haul", "Northline", ["black"], 13500,
    "Max cushion shoe for marathon training."),
  shoe("road-trainer-4-orange", "running-co", "Road Trainer 4", "Northline", ["orange", "white"], 10400,
    "Cushioned road shoe, orange colorway."),
  shoe("pace-lite-wht", "running-co", "Pace Lite", "Ferro", ["white"], 7900,
    "Simple low profile trainer for short runs."),
  shoe("pace-lite-w-pink", "running-co", "Pace Lite Women's", "Ferro", ["pink", "white"], 7900,
    "Simple low profile trainer, women's last.", { sizeSystem: "US_WOMENS" }),
  shoe("tempo-racer-blk", "shoe-supply", "Tempo Racer", "Kestrel", ["black", "volt-yellow"], 11800,
    "Light racing flat, black with volt accents."),
  shoe("stride-gray", "shoe-supply", "Stride", "Kestrel", ["gray", "black"], 9900,
    "Stable trainer with a wide base."),
  shoe("stride-w-beige", "shoe-supply", "Stride Women's", "Kestrel", ["beige"], 9900,
    "Stable trainer, women's last.", { sizeSystem: "US_WOMENS" }),
  shoe("cloudline-blue", "shoe-supply", "Cloudline", "Ostra", ["blue"], 12400,
    "Soft rocker shoe for recovery days."),

  // Trail shoes.
  shoe("ridge-runner-olive", "sports-outlet", "Ridge Runner", "Halden", ["olive", "black"], 11200,
    "Trail shoe with 4 mm lugs.", { category: "trail-shoes" }),
  shoe("switchback-brown", "running-co", "Switchback", "Northline", ["brown"], 12800,
    "Waterproof trail shoe.", { category: "trail-shoes" }),

  // Socks.
  item("crew-sock-3-wht", "sports-outlet", "Crew Run Sock, 3 pack", "running-socks", "Halden",
    ["white"], 1800, "Cushioned crew socks.", "Merino blend"),
  item("ankle-sock-3-blk", "running-co", "Ankle Run Sock, 3 pack", "running-socks", "Northline",
    ["black"], 1600, "Thin ankle socks.", "Nylon blend"),

  // Kids rain boots.
  shoe("puddle-boot-yellow", "sports-outlet", "Puddle Boot", "Little Ferro", ["volt-yellow"], 3900,
    "Rubber rain boot with pull handles.", { category: "kids-rain-boots", sizeSystem: "US_KIDS" }),
  shoe("puddle-boot-navy", "shoe-supply", "Puddle Boot", "Little Ferro", ["navy"], 4200,
    "Rubber rain boot with pull handles.", { category: "kids-rain-boots", sizeSystem: "US_KIDS" }),
  shoe("splash-boot-red", "running-co", "Splash Boot", "Ostra Kids", ["red"], 3400,
    "Light rain boot with a fleece lining.", { category: "kids-rain-boots", sizeSystem: "US_KIDS" }),

  // Coffee.
  item("coffee-house-12", "sports-outlet", "House Blend, 12 oz", "ground-coffee", "Morrow Roasters",
    ["brown"], 1450, "Medium roast, ground for drip."),
  item("coffee-dark-12", "running-co", "Dark Roast, 12 oz", "ground-coffee", "Morrow Roasters",
    ["brown"], 1550, "Dark roast, ground for espresso."),
  item("coffee-decaf-12", "shoe-supply", "Decaf, 12 oz", "ground-coffee", "Tallow Coffee",
    ["brown"], 1650, "Swiss water decaf, medium grind."),

  // Desk lamps.
  item("lamp-arc-blk", "sports-outlet", "Arc Desk Lamp", "desk-lamp", "Lumo", ["black"], 6900,
    "LED lamp with a dimmer.", "Aluminum"),
  item("lamp-arc-wht", "running-co", "Arc Desk Lamp", "desk-lamp", "Lumo", ["white"], 6900,
    "LED lamp with a dimmer.", "Aluminum"),
  item("lamp-task-gray", "shoe-supply", "Task Lamp", "desk-lamp", "Brightwell", ["gray"], 8400,
    "Clamp mounted LED lamp.", "Steel"),
  item("lamp-clip-beige", "shoe-supply", "Clip Lamp", "desk-lamp", "Brightwell", ["beige"], 2900,
    "Small clip lamp for shelves.", "Plastic"),
];
