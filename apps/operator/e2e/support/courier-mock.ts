import { NOW } from './console-data';

// OPERATOR-CONSOLE-DESIGN §10b's sample data (the sketch's COURIERS6, BLOCKING6, AREAS6 and CCR_USES), and the operator's
// courier routes answered over it the way the server answers them: retiring, undoing and removing a courier, RedX's areas,
// the thanas, and a shop's courier key log.

export interface CourierFixture {
  key: string;
  name: string;
  state: 'active' | 'retiring' | 'removed';
  suggestedKey: string | null;
  retiringSince: string | null;
  removedAt: string | null;
  shops: number;
  defaultFor: number;
  onTheirWay: number;
}

export interface AreaFixture {
  id: string;
  courierKey: string;
  areaCode: string;
  name: string;
  districtName: string;
  postCode: string | null;
  zillaId: number | null;
  thanaId: number | null;
  suggestedThanaId: number | null;
  match: 'own_name' | 'operator' | 'suggested' | 'none';
  retiredAt: string | null;
}

export interface CourierMockState {
  couriers: CourierFixture[];
  blocking: Record<string, unknown>[];
  areas: AreaFixture[];
  /** The chips' counts, as the live list would load; the table holds only the sketch's few. */
  areaCounts: Record<string, number>;
  areasRead: string | null;
  areaToken: boolean;
  courierUses: Record<string, unknown>[];
}

export function drawnCouriers(): CourierFixture[] {
  const courier = (
    key: string,
    name: string,
    shops: number,
    defaultFor: number,
    onTheirWay: number,
  ) => ({
    key,
    name,
    state: 'active' as const,
    suggestedKey: null,
    retiringSince: null,
    removedAt: null,
    shops,
    defaultFor,
    onTheirWay,
  });
  return [
    courier('steadfast', 'Steadfast', 212, 180, 1342),
    courier('pathao', 'Pathao', 64, 21, 410),
    courier('redx', 'RedX', 17, 6, 58),
  ];
}

/** RedX drawn retiring since 19 Oct, suggesting Pathao; its defaults have moved, but three shops had no other courier. */
export function retiringCouriers(onTheirWay = 58): CourierFixture[] {
  return drawnCouriers().map((each) =>
    each.key === 'redx'
      ? {
          ...each,
          state: 'retiring',
          suggestedKey: 'pathao',
          retiringSince: '2026-10-19T00:00:00+06:00',
          defaultFor: 3,
          onTheirWay,
        }
      : each,
  );
}

export function removedCouriers(): CourierFixture[] {
  return drawnCouriers().map((each) =>
    each.key === 'redx'
      ? {
          ...each,
          state: 'removed',
          suggestedKey: 'pathao',
          retiringSince: '2026-10-19T00:00:00+06:00',
          removedAt: '2026-11-18T00:00:00+06:00',
          shops: 0,
          defaultFor: 0,
          onTheirWay: 0,
        }
      : each,
  );
}

export function drawnBlocking(): Record<string, unknown>[] {
  const order = (
    shopName: string,
    slug: string,
    orderNumber: string,
    reason: string,
    courierStatus: string | null,
    finishedAt: string | null,
    waitsUntil: string | null,
  ) => ({
    tenantId: `ten-${slug}`,
    shopName,
    slug,
    orderId: `ord-${orderNumber}`,
    orderNumber,
    reason,
    courierStatus,
    finishedAt,
    waitsUntil,
  });
  return [
    order(
      'Rahim Fashion',
      'rahim-fashion',
      '261019-0042',
      'on_its_way',
      'delivery-in-progress',
      null,
      null,
    ),
    order(
      'Dhaka Gadget House',
      'dhaka-gadget',
      '261020-0007',
      'on_its_way',
      'agent-hold',
      null,
      null,
    ),
    order(
      'Dhaka Gadget House',
      'dhaka-gadget',
      '261018-0031',
      'awaiting_payout',
      null,
      '2026-10-18T00:00:00+06:00',
      '2026-11-17T00:00:00+06:00',
    ),
    order('Mim Bakery', 'mim-bakery', '261021-0003', 'not_settled', null, null, null),
  ];
}

/** The zillas and thanas the sketch's areas sit in, with the ids the shops' address forms would give them. */
export const DHAKA = 47;
export const CHATTOGRAM = 15;
export const THANAS = {
  banani: 4701,
  rampura: 4702,
  mirpur: 4703,
  gulshan: 4704,
  vatara: 4705,
  dhanmondi: 4706,
  badda: 4707,
  pallabi: 4708,
  kotwali: 1501,
};

export function drawnLocations(): Record<string, unknown> {
  const thana = (id: number, nameEn: string, nameBn: string) => ({
    id,
    nameEn,
    nameBn,
    cityCode: null,
  });
  return {
    cities: [],
    zillas: [
      {
        id: CHATTOGRAM,
        nameEn: 'Chattogram',
        nameBn: 'চট্টগ্রাম',
        thanas: [thana(THANAS.kotwali, 'Kotwali', 'কোতোয়ালি')],
      },
      {
        id: DHAKA,
        nameEn: 'Dhaka',
        nameBn: 'ঢাকা',
        thanas: [
          thana(THANAS.badda, 'Badda', 'বাড্ডা'),
          thana(THANAS.banani, 'Banani', 'বনানী'),
          thana(THANAS.dhanmondi, 'Dhanmondi', 'ধানমন্ডি'),
          thana(THANAS.gulshan, 'Gulshan', 'গুলশান'),
          thana(THANAS.mirpur, 'Mirpur', 'মিরপুর'),
          thana(THANAS.pallabi, 'Pallabi', 'পল্লবী'),
          thana(THANAS.rampura, 'Rampura', 'রামপুরা'),
          thana(THANAS.vatara, 'Vatara', 'ভাটারা'),
        ],
      },
    ],
  };
}

export function drawnAreas(): AreaFixture[] {
  const area = (
    id: string,
    name: string,
    areaCode: string,
    zilla: 'dhaka' | 'ctg',
    postCode: string | null,
    match: AreaFixture['match'],
    thanaId: number | null,
    suggestedThanaId: number | null,
    retiredAt: string | null = null,
  ): AreaFixture => ({
    id,
    courierKey: 'redx',
    areaCode,
    name,
    districtName: zilla === 'dhaka' ? 'Dhaka' : 'Chattogram',
    postCode,
    zillaId: zilla === 'dhaka' ? DHAKA : CHATTOGRAM,
    thanaId,
    suggestedThanaId,
    match,
    retiredAt,
  });
  return [
    area('area-1173', 'Kakoli(Banani)', '1173', 'dhaka', null, 'suggested', null, THANAS.banani),
    area(
      'area-1188',
      'Banasree(Rampura)',
      '1188',
      'dhaka',
      null,
      'suggested',
      null,
      THANAS.rampura,
    ),
    area(
      'area-2210',
      'Duaripara-Pallabi(Mirpur 12)',
      '2210',
      'dhaka',
      '1216',
      'suggested',
      null,
      THANAS.mirpur,
    ),
    area('area-110', 'Mirpur 10', '110', 'dhaka', '1216', 'own_name', THANAS.mirpur, null),
    area('area-101', 'Gulshan 1', '101', 'dhaka', '1212', 'own_name', THANAS.gulshan, null),
    area('area-1290', 'Bashundhara R/A', '1290', 'dhaka', null, 'operator', THANAS.vatara, null),
    area('area-1301', 'Notun Bazar', '1301', 'dhaka', null, 'none', null, null),
    area('area-4100', 'Agrabad', '4100', 'ctg', '4100', 'none', null, null),
    area(
      'area-9',
      'Old Kalabagan',
      '9',
      'dhaka',
      null,
      'operator',
      THANAS.dhanmondi,
      null,
      '2026-10-12T00:00:00+06:00',
    ),
  ];
}

/** As the live list of 2026-11-06 would load (the sketch's AREA_COUNTS6). */
export function drawnAreaCounts(): Record<string, number> {
  return { all: 2866, suggested: 1100, unassigned: 973, assigned: 793, retired: 0 };
}

export function drawnCourierUses(): Record<string, unknown>[] {
  const use = (
    at: string,
    courierKey: string,
    action: string,
    orderNumber: string | null,
    succeeded: boolean,
  ) => ({
    courierKey,
    action,
    connectionId: 'conn-1',
    orderId: orderNumber === null ? null : `ord-${orderNumber}`,
    orderNumber,
    succeeded,
    at,
  });
  return [
    use('2026-10-21T14:12:00+06:00', 'steadfast', 'book', '261021-0047', true),
    use('2026-10-21T13:40:00+06:00', 'pathao', 'renew', null, true),
    use('2026-10-21T11:02:00+06:00', 'pathao', 'book', '261021-0031', false),
    use('2026-10-20T23:01:00+06:00', 'steadfast', 'payouts', null, true),
    use('2026-10-20T23:00:00+06:00', 'steadfast', 'track', '261019-0042', true),
    use('2026-10-20T15:20:00+06:00', 'steadfast', 'look_up', '261020-0019', true),
    use('2026-10-20T15:18:00+06:00', 'steadfast', 'book', '261020-0019', false),
    use('2026-10-19T10:05:00+06:00', 'redx', 'cancel', '261018-0044', true),
    use('2026-10-18T09:00:00+06:00', 'steadfast', 'test', null, true),
  ];
}

export function courierDefaults(): CourierMockState {
  return {
    couriers: drawnCouriers(),
    blocking: drawnBlocking(),
    areas: drawnAreas(),
    areaCounts: drawnAreaCounts(),
    areasRead: '2026-10-19T03:00:00+06:00',
    areaToken: true,
    courierUses: drawnCourierUses(),
  };
}

const PER_PAGE = 50;

const STATE_OF: Record<string, (area: AreaFixture) => boolean> = {
  suggested: (area) => area.retiredAt === null && area.match === 'suggested',
  unassigned: (area) => area.retiredAt === null && area.match === 'none',
  assigned: (area) => area.retiredAt === null && area.thanaId !== null,
  retired: (area) => area.retiredAt !== null,
};

type Answer = { data: unknown } | { refused: [number, string, string] };

/** The operator's courier routes; undefined for any other. */
export function courierAnswer(
  method: string,
  path: string,
  url: URL,
  body: Record<string, unknown> | null,
  state: CourierMockState,
): Answer | undefined {
  if (path === '/operator/locations') return { data: drawnLocations() };
  if (path === '/operator/couriers') return { data: { couriers: state.couriers } };
  const acted = /^\/operator\/couriers\/([^/]+)\/(retire|undo-retire|blocking|remove)$/.exec(path);
  if (acted) {
    const courier = state.couriers.find((each) => each.key === acted[1]);
    if (!courier) return { refused: [404, 'not_found', 'This courier was not found.'] };
    const action = acted[2];
    if (action === 'blocking') {
      return {
        data: { courierKey: courier.key, total: state.blocking.length, orders: state.blocking },
      };
    }
    if (action === 'retire') {
      courier.state = 'retiring';
      courier.suggestedKey = String(body?.suggestedKey);
      courier.retiringSince = NOW;
      const moved = courier.defaultFor;
      courier.defaultFor = 3;
      return { data: { courier, told: courier.shops, defaultsMoved: moved - 3 } };
    }
    if (action === 'undo-retire') {
      courier.state = 'active';
      courier.suggestedKey = null;
      courier.retiringSince = null;
      return { data: { courier, told: courier.shops } };
    }
    if (state.blocking.length > 0) {
      return {
        refused: [
          409,
          'conflict',
          `${courier.name} can't be removed while orders still wait on it.`,
        ],
      };
    }
    const disconnected = courier.shops;
    Object.assign(courier, {
      state: 'removed',
      removedAt: NOW,
      shops: 0,
      defaultFor: 0,
      onTheirWay: 0,
    });
    return { data: { courier, disconnected } };
  }
  if (path === '/operator/courier-areas' && method === 'GET') {
    const wanted = url.searchParams.get('state');
    const zillaId = url.searchParams.get('zillaId');
    const word = (url.searchParams.get('q') ?? '').toLowerCase();
    const page = Number(url.searchParams.get('page') ?? 1);
    const matching = state.areas.filter(
      (area) =>
        (!wanted || (STATE_OF[wanted]?.(area) ?? false)) &&
        (!zillaId || area.zillaId === Number(zillaId)) &&
        (!word || area.name.toLowerCase().includes(word)),
    );
    // The total is the live list's for the filter, so the pages run as they would; a search counts only what it finds.
    const total = word || zillaId ? matching.length : (state.areaCounts[wanted ?? 'all'] ?? 0);
    return {
      data: {
        areas: matching.slice((page - 1) * PER_PAGE, page * PER_PAGE),
        page,
        limit: PER_PAGE,
        total,
        pages: Math.max(Math.ceil(total / PER_PAGE), 1),
        counts: state.areaCounts,
        lastReadAt: state.areasRead,
        tokenSet: state.areaToken,
      },
    };
  }
  if (path === '/operator/courier-areas/confirm') {
    const ids = (body?.ids as string[] | undefined) ?? [];
    let confirmed = 0;
    for (const area of state.areas) {
      if (ids.includes(area.id) && area.match === 'suggested') {
        area.thanaId = area.suggestedThanaId;
        area.suggestedThanaId = null;
        area.match = 'operator';
        confirmed += 1;
      }
    }
    state.areaCounts = {
      ...state.areaCounts,
      suggested: (state.areaCounts['suggested'] ?? 0) - confirmed,
      assigned: (state.areaCounts['assigned'] ?? 0) + confirmed,
    };
    return { data: { confirmed } };
  }
  if (path === '/operator/courier-areas/refresh') {
    if (!state.areaToken) {
      return { refused: [409, 'conflict', "Lytro's RedX token isn't set."] };
    }
    state.areasRead = NOW;
    return { data: { listed: 2866, added: 4, renamed: 1, retired: 2, back: 0 } };
  }
  const placed = /^\/operator\/courier-areas\/([^/]+)$/.exec(path);
  if (placed && method === 'PUT') {
    const area = state.areas.find((each) => each.id === placed[1]);
    if (!area) return { refused: [404, 'not_found', 'This area was not found.'] };
    const thanaId = body?.thanaId as number | null;
    area.thanaId = thanaId;
    area.suggestedThanaId = null;
    area.match = thanaId === null ? 'none' : 'operator';
    return { data: area };
  }
  return undefined;
}
