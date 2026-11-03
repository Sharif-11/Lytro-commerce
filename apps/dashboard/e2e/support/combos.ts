import type { Language } from './mock-api';
import type { PickerProduct, PickerVariant } from './new-order';
import type { ProductFixture, ProductsFixture } from './products';

// The combo editor against a mocked API (Slice 4.8c): what Add an item finds, as Part 31 draws it -- the panjabi in four
// sizes, the lungi with one variant, the T-shirt, a combo that can't go inside another and, found by name, the rice sold
// by weight -- the saved Eid combo, and what its parts come to, by the server's sums (combo-figures.ts).

type Words = [string, string];

const size = (id: string, label: string, price: number, available: number): PickerVariant => ({
  weightKg: 0.8,
  id,
  label: [label, label],
  price,
  available,
});

/** Part 31's list (`sh-k31-part`): a fresh copy each time, for a test to take a size off sale. */
export const comboPicker = (): PickerProduct[] => [
  {
    id: 'p-panjabi',
    name: ['কটন পাঞ্জাবি', 'Cotton panjabi'],
    kind: 'ordinary',
    variants: [
      size('v-pan-s', 'S', 1800, 8),
      size('v-pan-m', 'M', 1800, 12),
      size('v-pan-l', 'L', 1800, 9),
      size('v-pan-xl', 'XL', 1800, 4),
    ],
  },
  {
    id: 'p-lungi',
    name: ['চেক লুঙ্গি', 'Check lungi'],
    kind: 'ordinary',
    variants: [{ id: 'v-lungi', label: ['', ''], price: 1000, available: 6, weightKg: 0.3 }],
  },
  {
    id: 'p-tee',
    name: ['কটন টি-শার্ট', 'Cotton T-shirt'],
    kind: 'ordinary',
    variants: [
      size('v-tee-m', 'M', 450, 12),
      size('v-tee-l', 'L', 450, 24),
      size('v-tee-xl', 'XL', 450, 3),
    ],
  },
  {
    id: 'p-winter',
    name: ['শীতের কম্বো', 'Winter combo'],
    kind: 'combo',
    variants: [{ id: 'v-winter', label: ['', ''], price: 3200, available: 0 }],
  },
  {
    id: 'p-rice',
    name: ['মিনিকেট চাল', 'Miniket rice'],
    kind: 'ordinary',
    stockUnit: 'kg',
    searchedOnly: true,
    variants: [{ id: 'v-rice', label: ['', ''], price: 80, available: 25 }],
  },
];

/** Part 31's saved combo (`k31-combo-saved`): the panjabi in three sizes, and the lungi. */
export function eidCombo(): ProductFixture {
  return {
    id: 'p-eid',
    name: ['ঈদ কম্বো', 'Eid combo'],
    basePrice: '2450.00',
    active: true,
    stockState: 'low',
    primaryCategoryId: null,
    variantCount: 1,
    kind: 'combo',
    stockTracking: 'not_tracked',
    description: null,
    taxClassId: 'tx-5',
    parts: [
      { quantity: '1.000', variantIds: ['v-pan-s', 'v-pan-m', 'v-pan-l'] },
      { quantity: '1.000', variantIds: ['v-lungi'] },
    ],
  };
}

/** The drawn shop with Part 31's picker and its Eid combo. */
export function withEidCombo(fixture: ProductsFixture): ProductsFixture {
  fixture.picker = comboPicker();
  fixture.products.unshift(eidCombo());
  return fixture;
}

const say = (words: Words, language: Language): string => words[language === 'bn' ? 0 : 1];

function find(picker: readonly PickerProduct[], variantId: string) {
  for (const product of picker) {
    const variant = product.variants.find((each) => each.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

/** A combo's parts as `GET /products/:id` reads them. */
export function partViews(
  parts: readonly { quantity: string; variantIds: string[] }[],
  picker: readonly PickerProduct[],
  language: Language,
): unknown[] {
  return parts.map((part, index) => ({
    position: index + 1,
    quantity: part.quantity,
    variants: part.variantIds.flatMap((variantId) => {
      const found = find(picker, variantId);
      if (!found) return [];
      return [
        {
          variantId,
          productId: found.product.id,
          productName: say(found.product.name, language),
          label: say(found.variant.label, language),
          available: found.variant.gone !== 'part_retired',
          stockUnit: found.product.stockUnit ?? 'piece',
        },
      ];
    }),
  }));
}

/** The first variant of these parts that has gone, as the server names it when they are saved again (CMB-08). */
export function retiredField(
  parts: readonly { variantIds: string[] }[],
  picker: readonly PickerProduct[],
): string | null {
  for (const [index, part] of parts.entries()) {
    for (const [at, variantId] of part.variantIds.entries()) {
      if (find(picker, variantId)?.variant.gone === 'part_retired') {
        return `parts.${String(index)}.variantIds.${String(at)}`;
      }
    }
  }
  return null;
}

/** POST /products/combo-quote: what the parts come to, by the sums in the server's combo-figures.ts. */
export function comboQuote(
  body: Record<string, unknown> | null,
  picker: readonly PickerProduct[],
  language: Language,
): unknown {
  const sent = (body?.parts ?? []) as { quantity: number; variantIds: string[] }[];
  let value = 0;
  let weight: number | null = 0;
  let canMake: number | null = null;
  let limitedBy: { position: number; productName: string; available: string } | null = null;
  const issues: { position: number; productName: string; reason: string }[] = [];
  const parts: { position: number; price: string; image: null }[] = [];
  for (const [index, part] of sent.entries()) {
    const position = index + 1;
    const found = part.variantIds.flatMap((id) => find(picker, id) ?? []);
    const first = found[0];
    const name = first ? say(first.product.name, language) : '';
    const live = found.filter((each) => !each.variant.gone);
    if (live.length === 0) {
      issues.push({
        position,
        productName: name,
        reason: found.length > 1 ? 'no_choice_left' : (first?.variant.gone ?? 'part_retired'),
      });
    }
    const counted = live.map((each) => each.variant.available);
    if (!counted.includes(null)) {
      const total = counted.reduce<number>((sum, each) => sum + (each ?? 0), 0);
      const made = Math.floor(total / part.quantity);
      if (canMake === null || made < canMake) {
        limitedBy = { position, productName: name, available: total.toFixed(3) };
        canMake = made;
      }
    }
    const priced = live.length > 0 ? live : found;
    const price = Math.min(...priced.map((each) => each.variant.price)) * part.quantity;
    value += price;
    const weights = priced.map((each) => each.variant.weightKg ?? null);
    weight =
      weight === null || weights.includes(null)
        ? null
        : weight + Math.max(...(weights as number[])) * part.quantity;
    parts.push({ position, price: price.toFixed(2), image: null });
  }
  const basePrice = body?.basePrice as number | undefined;
  return {
    partsValue: value.toFixed(2),
    saving: basePrice !== undefined && value > basePrice ? (value - basePrice).toFixed(2) : null,
    canMake,
    limitedBy: issues.length > 0 ? null : limitedBy,
    issues,
    weightKg: weight === null ? null : weight.toFixed(3),
    parts,
  };
}
