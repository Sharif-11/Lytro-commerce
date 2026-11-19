import { OfferCutKind, OfferState, type OfferCut } from '@lytronix/validators';
import type {
  Offer,
  OfferItem,
  OfferPick,
  OfferPickPage,
  OfferPickProduct,
  OfferSummary,
} from '../../src/types/offers';

// OFFERS-PLAN: the shop's offers as the server answers them, drawn from the sketch (`of-*`) -- the Eid offer running,
// a Flash sale not started, a Puja offer ended -- and the screens' writes, kept so a read after shows what changed.

const id = (n: number) => `0ff00000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A product the picker lists, with its price now (each design's the same) and its designs. */
interface DrawnProduct {
  id: string;
  name: string;
  price: number;
  regular?: number;
  designs?: { id: string; name: string }[];
}

export const OFFER_PRODUCTS: readonly DrawnProduct[] = [
  {
    id: id(101),
    name: 'Irani burka',
    price: 2450,
    designs: [
      { id: id(201), name: 'Design 1' },
      { id: id(202), name: 'Stripe' },
      { id: id(203), name: 'Design 3' },
      { id: id(204), name: 'Design 4' },
      { id: id(205), name: 'Design 5' },
    ],
  },
  { id: id(102), name: 'Embroidered panjabi', price: 1450, regular: 1900 },
  { id: id(103), name: 'Cotton T-shirt', price: 450 },
  { id: id(104), name: 'Silk saree', price: 3200 },
  { id: id(105), name: 'Denim jacket', price: 1890 },
  { id: id(106), name: 'Linen panjabi', price: 1690 },
  { id: id(107), name: 'Hair band', price: 350 },
];

export const EID_ID = id(1);
export const FLASH_ID = id(2);
export const PUJA_ID = id(3);

export interface OffersFixture {
  offers: Offer[];
  /** The ID the next offer made gets. */
  next: number;
}

/** OF-2, OF-11, OF-18: the price after the cut, whole taka rounded down; null below ৳1. */
function cutPrice(price: number, cut: OfferCut): number | null {
  const after =
    cut.kind === OfferCutKind.Percent
      ? Math.floor((price * (100 - cut.amount)) / 100)
      : price - cut.amount;
  return after >= 1 ? after : null;
}

const span = (value: number) => ({ low: value.toFixed(2), high: value.toFixed(2) });

/** One pick as its row shows it, priced by the cut; `ended`, its price now only. */
function itemOf(pick: OfferPick, cut: OfferCut, ended: boolean, holder: string | null): OfferItem {
  const product = OFFER_PRODUCTS.find((each) => each.id === pick.productId);
  if (!product) throw new Error(`no drawn product ${pick.productId}`);
  const design = product.designs?.find((each) => each.id === pick.designId) ?? null;
  const after = cutPrice(product.price, cut);
  return {
    productId: product.id,
    designId: design?.id ?? null,
    name: product.name,
    designName: design?.name ?? null,
    designNumber: design ? (product.designs?.indexOf(design) ?? 0) + 1 : null,
    designCount: product.designs?.length ?? 0,
    image: null,
    active: true,
    stockState: 'in',
    price: span(product.price),
    was: ended ? null : span(product.regular ?? product.price),
    offer: ended || after === null ? null : span(after),
    belowOne: !ended && after === null,
    heldBy: holder === null ? null : { offerId: FLASH_ID, name: holder },
  };
}

function offerOf(base: Omit<Offer, 'items' | 'products' | 'designs'>, picks: OfferPick[]): Offer {
  return {
    ...base,
    products: new Set(picks.map((pick) => pick.productId)).size,
    designs: picks.filter((pick) => pick.designId !== null).length,
    items: picks.map((pick) => itemOf(pick, base.cut, base.state === OfferState.Ended, null)),
  };
}

export function drawnOffers(): OffersFixture {
  const eid: OfferPick[] = [
    { productId: id(101), designId: id(202) },
    { productId: id(101), designId: id(203) },
    { productId: id(102), designId: null },
    { productId: id(103), designId: null },
    { productId: id(104), designId: null },
  ];
  return {
    next: 10,
    offers: [
      offerOf(
        {
          id: EID_ID,
          name: 'Eid offer',
          slug: 'eid-offer',
          state: OfferState.Running,
          cut: { kind: OfferCutKind.Percent, amount: 20 },
          startedAt: '2026-11-15T04:12:00.000Z',
          endedAt: null,
          createdAt: '2026-11-14T10:00:00.000Z',
        },
        eid,
      ),
      offerOf(
        {
          id: FLASH_ID,
          name: 'Flash sale',
          slug: 'flash-sale',
          state: OfferState.Waiting,
          cut: { kind: OfferCutKind.Taka, amount: 200 },
          startedAt: null,
          endedAt: null,
          createdAt: '2026-11-16T10:00:00.000Z',
        },
        [{ productId: id(106), designId: null }],
      ),
      offerOf(
        {
          id: PUJA_ID,
          name: 'Puja offer',
          slug: 'puja-offer',
          state: OfferState.Ended,
          cut: { kind: OfferCutKind.Percent, amount: 15 },
          startedAt: '2026-10-10T04:00:00.000Z',
          endedAt: '2026-10-20T17:40:00.000Z',
          createdAt: '2026-10-09T10:00:00.000Z',
        },
        [{ productId: id(105), designId: null }],
      ),
    ],
  };
}

function summaryOf(offer: Offer): OfferSummary {
  return {
    id: offer.id,
    name: offer.name,
    slug: offer.slug,
    state: offer.state,
    cut: offer.cut,
    products: offer.products,
    designs: offer.designs,
    startedAt: offer.startedAt,
    endedAt: offer.endedAt,
    createdAt: offer.createdAt,
  };
}

/** OF-25: the picker's page -- every drawn product, the Linen panjabi held by the Flash sale (unless it is the one asked). */
function pickable(fixture: OffersFixture, url: URL): OfferPickPage {
  const asking = url.searchParams.get('offerId');
  const search = url.searchParams.get('search')?.toLowerCase() ?? null;
  const holderOf = (productId: string, designId: string | null): string | null => {
    const holder = fixture.offers.find(
      (offer) =>
        offer.id !== asking &&
        offer.state !== OfferState.Ended &&
        offer.items.some(
          (item) =>
            item.productId === productId &&
            (item.designId === null || (designId !== null && item.designId === designId)),
        ),
    );
    return holder?.name ?? null;
  };
  const products: OfferPickProduct[] = OFFER_PRODUCTS.filter(
    (product) => search === null || product.name.toLowerCase().includes(search),
  ).map((product) => {
    const held = holderOf(product.id, null);
    return {
      productId: product.id,
      name: product.name,
      image: null,
      price: span(product.price),
      regularPrice: product.regular === undefined ? null : product.regular.toFixed(2),
      active: true,
      stockState: 'in',
      isCombo: false,
      heldBy: held === null ? null : { offerId: FLASH_ID, name: held },
      designs: (product.designs ?? []).map((design, at) => ({
        designId: design.id,
        name: design.name,
        number: at + 1,
        image: null,
        price: product.price.toFixed(2),
        heldBy: (() => {
          const name = holderOf(product.id, design.id);
          return name === null ? null : { offerId: EID_ID, name };
        })(),
      })),
    };
  });
  return { products, more: false };
}

/** The Offers screens' reads. */
export function offersAnswer(path: string, url: URL, fixture: OffersFixture): unknown {
  if (path === '/offers') return { offers: fixture.offers.map(summaryOf) };
  if (path === '/offers/pickable') return pickable(fixture, url);
  const one = /^\/offers\/([^/]+)$/.exec(path);
  if (one?.[1]) return fixture.offers.find((offer) => offer.id === one[1]);
  return undefined;
}

type Written = { data: unknown } | { status: number; code: string } | undefined;

/** The Offers screens' writes: preview, make, change, start, end, run again, delete. */
export function offersWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  fixture: OffersFixture,
): Written {
  const picksOf = (value: unknown) => (value ?? []) as OfferPick[];
  if (method === 'POST' && path === '/offers/preview') {
    const cut = body?.['cut'] as OfferCut;
    return {
      data: {
        items: picksOf(body?.['items']).map((pick) => {
          // OF-16: held when another offer not ended holds the same design, or either is the product whole.
          const holder = fixture.offers.find(
            (offer) =>
              offer.id !== body?.['offerId'] &&
              offer.state !== OfferState.Ended &&
              offer.items.some(
                (item) =>
                  item.productId === pick.productId &&
                  (item.designId === null ||
                    pick.designId === null ||
                    item.designId === pick.designId),
              ),
          );
          return itemOf(pick, cut, false, holder ? holder.name : null);
        }),
      },
    };
  }
  if (method === 'POST' && path === '/offers') {
    const start = body?.['start'] === true;
    const name = typeof body?.['name'] === 'string' ? body['name'] : '';
    const made = offerOf(
      {
        id: id(fixture.next++),
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        state: start ? OfferState.Running : OfferState.Waiting,
        cut: body?.['cut'] as OfferCut,
        startedAt: start ? '2026-11-19T06:00:00.000Z' : null,
        endedAt: null,
        createdAt: '2026-11-19T06:00:00.000Z',
      },
      picksOf(body?.['items']),
    );
    fixture.offers.unshift(made);
    return { data: made };
  }
  const step = /^\/offers\/([^/]+)(?:\/(start|end|copy))?$/.exec(path);
  if (!step?.[1]) return undefined;
  const at = fixture.offers.findIndex((offer) => offer.id === step[1]);
  const offer = fixture.offers[at];
  if (!offer) return { status: 404, code: 'not_found' };
  const picks = (from: Offer): OfferPick[] =>
    from.items.map((item) => ({ productId: item.productId, designId: item.designId }));
  if (method === 'PATCH' && step[2] === undefined) {
    const changed = offerOf(
      {
        ...summaryOf(offer),
        name: typeof body?.['name'] === 'string' ? body['name'] : offer.name,
        cut: (body?.['cut'] as OfferCut | undefined) ?? offer.cut,
      },
      body?.['items'] ? picksOf(body['items']) : picks(offer),
    );
    fixture.offers[at] = changed;
    return { data: changed };
  }
  if (method === 'POST' && step[2] === 'start') {
    const started = offerOf(
      { ...summaryOf(offer), state: OfferState.Running, startedAt: '2026-11-19T06:00:00.000Z' },
      picks(offer),
    );
    fixture.offers[at] = started;
    return { data: started };
  }
  if (method === 'POST' && step[2] === 'end') {
    const ended = offerOf(
      { ...summaryOf(offer), state: OfferState.Ended, endedAt: '2026-11-19T06:00:00.000Z' },
      picks(offer),
    );
    fixture.offers[at] = ended;
    return { data: ended };
  }
  if (method === 'POST' && step[2] === 'copy') {
    const copy = offerOf(
      {
        ...summaryOf(offer),
        id: id(fixture.next++),
        slug: `${offer.slug}-2`,
        state: OfferState.Waiting,
        startedAt: null,
        endedAt: null,
      },
      picks(offer),
    );
    fixture.offers.unshift(copy);
    return { data: copy };
  }
  if (method === 'DELETE' && step[2] === undefined) {
    fixture.offers.splice(at, 1);
    return { data: { offers: fixture.offers.map(summaryOf) } };
  }
  return undefined;
}
