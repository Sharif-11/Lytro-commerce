import type { Language } from './mock-api';

// Delivery against a mocked API (Slice 11.11; DLV-01 to DLV-07, RAT-14): a slice of the canonical locations with their
// thanas, the shop's zones as the prototype draws them (Inside and Outside Dhaka city, Chattogram and Sylhet, the Hill
// districts with no delivery), and every write kept, so the reads after show what changed. A zone another zone's area
// would take is refused as the server refuses it; one a product still names is refused naming the products.

export interface ZoneFixture {
  id: string;
  /** The shop's own name; null for a fixed zone following the home area. */
  name: string | null;
  charge: string;
  isHome?: boolean;
  isFallback?: boolean;
  noDelivery?: boolean;
  cityCodes: string[];
  zillaIds: number[];
  locationIds: number[];
}

export interface DeliveryFixture {
  zones: ZoneFixture[];
  perKg: string;
  /** DLV-07: the products whose delivery limit names a zone, by zone id. */
  holders?: Record<string, { id: string; name: string; archived: boolean }[]>;
  maxZones?: number;
}

type City = { code: string; nameEn: string; nameBn: string };
type Thana = { id: number; nameEn: string; nameBn: string; cityCode: string | null };
type Zilla = { id: number; nameEn: string; nameBn: string; thanas: Thana[] };

const city = (code: string, nameEn: string, nameBn: string): City => ({ code, nameEn, nameBn });
const thana = (
  id: number,
  nameEn: string,
  nameBn: string,
  cityCode: string | null = null,
): Thana => ({
  id,
  nameEn,
  nameBn,
  cityCode,
});

/** GET /locations: five city areas and the districts the tests and the sketch name, each with some of its thanas. */
export const LOCATIONS: { cities: City[]; zillas: Zilla[] } = {
  cities: [
    city('dhaka', 'Dhaka city', 'ঢাকা সিটি'),
    city('chattogram', 'Chattogram city', 'চট্টগ্রাম সিটি'),
    city('sylhet', 'Sylhet city', 'সিলেট সিটি'),
    city('khulna', 'Khulna city', 'খুলনা সিটি'),
    city('rajshahi', 'Rajshahi city', 'রাজশাহী সিটি'),
  ],
  zillas: [
    {
      id: 1,
      nameEn: 'Dhaka',
      nameBn: 'ঢাকা',
      thanas: [
        thana(101, 'Banani', 'বনানী', 'dhaka'),
        thana(102, 'Mirpur', 'মিরপুর', 'dhaka'),
        thana(103, 'Pallabi', 'পল্লবী', 'dhaka'),
        thana(104, 'Kafrul', 'কাফরুল', 'dhaka'),
        thana(105, 'Savar', 'সাভার'),
        thana(106, 'Dhamrai', 'ধামরাই'),
      ],
    },
    {
      id: 2,
      nameEn: 'Gazipur',
      nameBn: 'গাজীপুর',
      thanas: [
        thana(201, 'Gazipur Sadar', 'গাজীপুর সদর'),
        thana(202, 'Kaliakair', 'কালিয়াকৈর'),
        thana(203, 'Kaliganj', 'কালীগঞ্জ'),
        thana(204, 'Kapasia', 'কাপাসিয়া'),
        thana(205, 'Sreepur', 'শ্রীপুর'),
      ],
    },
    {
      id: 3,
      nameEn: 'Chattogram',
      nameBn: 'চট্টগ্রাম',
      thanas: [
        thana(301, 'Panchlaish', 'পাঁচলাইশ', 'chattogram'),
        thana(302, 'Bandar', 'বন্দর', 'chattogram'),
        thana(303, 'Patenga', 'পতেঙ্গা', 'chattogram'),
        thana(304, 'Banshkhali', 'বাঁশখালী'),
      ],
    },
    {
      id: 4,
      nameEn: 'Bandarban',
      nameBn: 'বান্দরবান',
      thanas: [thana(401, 'Ruma', 'রুমা'), thana(402, 'Thanchi', 'থানচি')],
    },
    { id: 5, nameEn: 'Rangamati', nameBn: 'রাঙামাটি', thanas: [thana(501, 'Kaptai', 'কাপ্তাই')] },
    {
      id: 6,
      nameEn: 'Khagrachhari',
      nameBn: 'খাগড়াছড়ি',
      thanas: [thana(601, 'Dighinala', 'দীঘিনালা')],
    },
    {
      id: 7,
      nameEn: 'Sylhet',
      nameBn: 'সিলেট',
      thanas: [thana(701, 'Kotwali', 'কোতোয়ালি', 'sylhet')],
    },
    {
      id: 8,
      nameEn: 'Cumilla',
      nameBn: 'কুমিল্লা',
      thanas: [thana(801, 'Cumilla Sadar', 'কুমিল্লা সদর')],
    },
    {
      id: 9,
      nameEn: 'Narayanganj',
      nameBn: 'নারায়ণগঞ্জ',
      thanas: [thana(901, 'Rupganj', 'রূপগঞ্জ')],
    },
  ],
};

/** The prototype's `delivery`: Dhaka city at ৳70 and ৳130, Chattogram and Sylhet at ৳100, the Hill districts not served. */
export function drawnDelivery(language: Language): DeliveryFixture {
  const bn = language === 'bn';
  return {
    perKg: '20.00',
    zones: [
      {
        id: 'z-in',
        name: null,
        charge: '70.00',
        isHome: true,
        cityCodes: ['dhaka'],
        zillaIds: [],
        locationIds: [],
      },
      {
        id: 'z-out',
        name: null,
        charge: '130.00',
        isFallback: true,
        cityCodes: [],
        zillaIds: [],
        locationIds: [],
      },
      {
        id: 'z-ctg',
        name: bn ? 'চট্টগ্রাম ও সিলেট' : 'Chattogram and Sylhet',
        charge: '100.00',
        cityCodes: ['chattogram', 'sylhet'],
        zillaIds: [],
        locationIds: [],
      },
      {
        id: 'z-hill',
        name: bn ? 'পার্বত্য এলাকা' : 'Hill districts',
        charge: '0.00',
        noDelivery: true,
        cityCodes: [],
        zillaIds: [4, 5, 6],
        locationIds: [],
      },
    ],
  };
}

function thanaOf(id: number): { thana: Thana; zilla: Zilla } | null {
  for (const zilla of LOCATIONS.zillas) {
    const found = zilla.thanas.find((each) => each.id === id);
    if (found) return { thana: found, zilla };
  }
  return null;
}

function areasView(zone: ZoneFixture): unknown {
  return {
    cities: LOCATIONS.cities.filter((each) => zone.cityCodes.includes(each.code)),
    zillas: LOCATIONS.zillas
      .filter((each) => zone.zillaIds.includes(each.id))
      .map(({ id, nameEn, nameBn }) => ({ id, nameEn, nameBn })),
    thanas: zone.locationIds.flatMap((id) => {
      const found = thanaOf(id);
      return found ? [{ ...found.thana, zillaId: found.zilla.id }] : [];
    }),
  };
}

/** The home area as the server names it (zone-labels.ts): one city, one district, or the shop's own thanas. */
function homeArea(fixture: DeliveryFixture): {
  kind: string;
  label: { en: string; bn: string };
  bnOf: string;
} {
  const home = fixture.zones.find((zone) => zone.isHome);
  const cityHere = LOCATIONS.cities.find((each) => home?.cityCodes.includes(each.code));
  if (cityHere)
    return {
      kind: 'city',
      label: { en: cityHere.nameEn, bn: cityHere.nameBn },
      bnOf: `${cityHere.nameBn}র`,
    };
  const zilla = LOCATIONS.zillas.find((each) => home?.zillaIds.includes(each.id));
  if (zilla) {
    const bn = `${zilla.nameBn} জেলা`;
    return { kind: 'zilla', label: { en: `${zilla.nameEn} district`, bn }, bnOf: `${bn}র` };
  }
  const names = (home?.locationIds ?? []).flatMap((id) => {
    const found = thanaOf(id);
    return found ? [found.thana] : [];
  });
  const listed = (parts: string[], and: string, more: (n: number) => string) =>
    parts.length <= 2
      ? parts.join(` ${and} `)
      : `${parts.slice(0, 2).join(', ')} ${and} ${more(parts.length - 2)}`;
  const en = listed(
    names.map((each) => each.nameEn),
    'and',
    (n) => `${String(n)} more`,
  );
  const bn = listed(
    names.map((each) => each.nameBn),
    'ও',
    (n) => `আরও ${String(n)}টি`,
  );
  return { kind: 'thanas', label: { en, bn }, bnOf: `${bn} এলাকার` };
}

function zoneView(fixture: DeliveryFixture, zone: ZoneFixture): unknown {
  const area = homeArea(fixture);
  const automatic = zone.isHome
    ? { en: `Inside ${area.label.en}`, bn: `${area.bnOf} ভেতরে` }
    : { en: `Outside ${area.label.en}`, bn: `${area.bnOf} বাইরে` };
  return {
    id: zone.id,
    name: zone.name,
    label: zone.name !== null ? { en: zone.name, bn: zone.name } : automatic,
    charge: zone.charge,
    isHome: zone.isHome ?? false,
    isFallback: zone.isFallback ?? false,
    noDelivery: zone.noDelivery ?? false,
    areas: areasView(zone),
  };
}

export function deliveryView(fixture: DeliveryFixture): unknown {
  const area = homeArea(fixture);
  return {
    homeArea: { kind: area.kind, label: area.label },
    zones: fixture.zones.map((zone) => zoneView(fixture, zone)),
    maxZones: fixture.maxZones ?? 20,
    extraDeliveryChargePerKg: fixture.perKg,
  };
}

type Areas = { cityCodes?: string[]; zillaIds?: number[]; locationIds?: number[] };

/** DLV-02: an area another zone holds, as the server refuses it. */
function takenBy(fixture: DeliveryFixture, areas: Areas, zoneId: string | null): boolean {
  return fixture.zones.some(
    (zone) =>
      zone.id !== zoneId &&
      ((areas.cityCodes ?? []).some((code) => zone.cityCodes.includes(code)) ||
        (areas.zillaIds ?? []).some((id) => zone.zillaIds.includes(id)) ||
        (areas.locationIds ?? []).some((id) => zone.locationIds.includes(id))),
  );
}

type Refused = {
  refused: { status: number; code: string; message: string; details: Record<string, unknown> };
};
const TAKEN: Refused = {
  refused: {
    status: 409,
    code: 'conflict',
    message: 'This area is already in another zone.',
    details: {},
  },
};

/** Delivery's reads and writes; undefined for any other request (a per-kg write goes on to the settings). */
export function deliveryAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  fixture: DeliveryFixture,
): { data: unknown } | Refused | undefined {
  if (method === 'GET' && path === '/locations') return { data: LOCATIONS };
  if (method === 'GET' && path === '/delivery-zones') return { data: deliveryView(fixture) };
  if (
    method === 'PATCH' &&
    path === '/shop-settings' &&
    typeof body?.extraDeliveryChargePerKg === 'number'
  ) {
    fixture.perKg = body.extraDeliveryChargePerKg.toFixed(2);
    return undefined;
  }
  if (method === 'GET' && path === '/delivery-zones/resolve') {
    const found = thanaOf(Number(url.searchParams.get('locationId')));
    if (!found) return undefined;
    const byThana = fixture.zones.find((zone) => zone.locationIds.includes(found.thana.id));
    const byCity =
      found.thana.cityCode === null
        ? undefined
        : fixture.zones.find((zone) => zone.cityCodes.includes(found.thana.cityCode ?? ''));
    const byZilla = fixture.zones.find((zone) => zone.zillaIds.includes(found.zilla.id));
    const zone = byThana ?? byCity ?? byZilla ?? fixture.zones.find((each) => each.isFallback);
    if (!zone) return undefined;
    return {
      data: {
        location: { ...found.thana, zillaId: found.zilla.id },
        matchedBy: byThana ? 'thana' : byCity ? 'city' : byZilla ? 'zilla' : 'fallback',
        zone: zoneView(fixture, zone),
      },
    };
  }
  const areas = (body?.areas ?? {}) as Areas;
  if (method === 'PUT' && path === '/delivery-zones/home-area') {
    const home = fixture.zones.find((zone) => zone.isHome);
    if (!home) return undefined;
    home.cityCodes = areas.cityCodes ?? [];
    home.zillaIds = areas.zillaIds ?? [];
    home.locationIds = areas.locationIds ?? [];
    return { data: deliveryView(fixture) };
  }
  if (method === 'POST' && path === '/delivery-zones') {
    if (fixture.zones.length >= (fixture.maxZones ?? 20)) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: 'A shop has at most 20 zones.',
          details: {},
        },
      };
    }
    if (takenBy(fixture, areas, null)) return TAKEN;
    fixture.zones.push({
      id: `z-new-${String(fixture.zones.length + 1)}`,
      name: typeof body?.name === 'string' ? body.name : '',
      charge: Number(body?.charge ?? 0).toFixed(2),
      noDelivery: body?.noDelivery === true,
      cityCodes: areas.cityCodes ?? [],
      zillaIds: areas.zillaIds ?? [],
      locationIds: areas.locationIds ?? [],
    });
    return { data: deliveryView(fixture) };
  }
  const one = /^\/delivery-zones\/([^/]+)(\/areas)?$/.exec(path);
  const zone = fixture.zones.find((each) => each.id === one?.[1]);
  if (!one || !zone) return undefined;
  if (method === 'PATCH' && !one[2] && body) {
    if ('name' in body) zone.name = (body.name as string | null) ?? null;
    if (typeof body.charge === 'number') zone.charge = body.charge.toFixed(2);
    if (typeof body.noDelivery === 'boolean') zone.noDelivery = body.noDelivery;
    return { data: deliveryView(fixture) };
  }
  if (method === 'PUT' && one[2]) {
    if (takenBy(fixture, areas, zone.id)) return TAKEN;
    zone.cityCodes = areas.cityCodes ?? [];
    zone.zillaIds = areas.zillaIds ?? [];
    zone.locationIds = areas.locationIds ?? [];
    return { data: deliveryView(fixture) };
  }
  if (method === 'DELETE' && !one[2]) {
    const holders = fixture.holders?.[zone.id] ?? [];
    if (holders.length > 0) {
      return {
        refused: {
          status: 409,
          code: 'conflict',
          message: 'Products still deliver only to this zone.',
          details: { products: holders },
        },
      };
    }
    fixture.zones.splice(fixture.zones.indexOf(zone), 1);
    return { data: deliveryView(fixture) };
  }
  return undefined;
}
