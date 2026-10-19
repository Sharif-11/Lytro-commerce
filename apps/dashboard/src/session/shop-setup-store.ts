// AUTH-28 step 4 (PST-01 shop type, DLV-01 home area) and SUP-01's "share the shop link" tick, kept per shop
// on this device. The backend has no endpoint for the set-up answers or the share tick yet (Phase 3 Slices
// 11 and 12); this store is the one seam those calls replace, so the screens do not change when they land.
export const SHOP_TYPES = [
  'clothing',
  'shoes_bags',
  'cosmetics',
  'electronics',
  'mobiles_gadgets',
  'grocery',
  'food_bakery',
  'books_stationery',
  'pharmacy',
  'home_decor',
  'other',
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

/** The home areas the set-up step offers (CUS-08's full list arrives with Slice 12). */
export const HOME_AREAS = [
  'dhaka_city',
  'chattogram_city',
  'sylhet_city',
  'khulna_city',
  'rajshahi_city',
  'barishal_city',
  'rangpur_city',
  'mymensingh_city',
  'cumilla_district',
  'gazipur_district',
  'narayanganj_district',
] as const;
export type HomeArea = (typeof HOME_AREAS)[number];

/** DLV-01: the two zones every shop starts with, from its home area. */
export const DEFAULT_ZONE_CHARGES = { inside: 70, outside: 130 } as const;

export interface ShopSetup {
  shopType: ShopType | null;
  homeArea: HomeArea;
  sharedLink: boolean;
  setUpDone: boolean;
}

const DEFAULTS: ShopSetup = {
  shopType: null,
  homeArea: 'dhaka_city',
  sharedLink: false,
  setUpDone: false,
};

export class ShopSetupStore {
  constructor(private readonly storage: Storage | null = ShopSetupStore.localStorage()) {}

  read(slug: string): ShopSetup {
    try {
      const raw = this.storage?.getItem(this.key(slug));
      if (!raw) return DEFAULTS;
      const parsed = JSON.parse(raw) as Partial<ShopSetup>;
      return {
        shopType: SHOP_TYPES.find((type) => type === parsed.shopType) ?? null,
        homeArea: HOME_AREAS.find((area) => area === parsed.homeArea) ?? 'dhaka_city',
        sharedLink: parsed.sharedLink === true,
        setUpDone: parsed.setUpDone === true,
      };
    } catch {
      return DEFAULTS;
    }
  }

  update(slug: string, patch: Partial<ShopSetup>): ShopSetup {
    const next = { ...this.read(slug), ...patch };
    try {
      this.storage?.setItem(this.key(slug), JSON.stringify(next));
    } catch {
      // Without storage the answer lives only for this page.
    }
    return next;
  }

  private key(slug: string): string {
    return `lytro.shop.${slug}.setup`;
  }

  private static localStorage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }
}

export const shopSetupStore = new ShopSetupStore();
