import type { Language } from './mock-api';

// GET /activity as the server answers it (AUD-04, AUD-06): the prototype's six entries, today's three and
// yesterday's three, each with the summary the server writes for its action.

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** A moment `daysAgo` days back in Dhaka's calendar, at its clock time `hh:mm`. */
function dhakaAt(daysAgo: number, hh: number, mm: number): string {
  const dhakaNow = new Date(Date.now() + DHAKA_OFFSET_MS);
  const midnight = Date.UTC(
    dhakaNow.getUTCFullYear(),
    dhakaNow.getUTCMonth(),
    dhakaNow.getUTCDate() - daysAgo,
  );
  return new Date(midnight + (hh * 60 + mm) * 60 * 1000 - DHAKA_OFFSET_MS).toISOString();
}

export interface ActivityFixture {
  id: string;
  tenantId: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  summary: unknown;
  ip: string | null;
  createdAt: string;
}

function entry(
  id: string,
  at: string,
  action: string,
  actorName: string | null,
  summary: unknown = null,
  result = 'success',
): ActivityFixture {
  return {
    id,
    tenantId: 'tenant-1',
    actorType: 'user',
    actorId: actorName === null ? null : `u-${id}`,
    actorName,
    action,
    targetType: null,
    targetId: null,
    result,
    summary,
    ip: null,
    createdAt: at,
  };
}

/** The prototype's `activity`: Kamal's stock edit and sign-in, Rumana's top-up, deactivation and new product, a failure. */
export function drawnActivity(language: Language): ActivityFixture[] {
  const bn = language === 'bn';
  const kamal = bn ? 'কামাল' : 'Kamal';
  const rumana = bn ? 'রুমানা' : 'Rumana';
  return [
    entry('6', dhakaAt(0, 11, 50), 'stock_adjusted', kamal, {
      variantId: 'v-m',
      from: '7',
      to: '4',
      reason: 'damaged',
    }),
    entry('5', dhakaAt(0, 10, 2), 'balance_topped_up', rumana, { amount: '500.00' }),
    entry('4', dhakaAt(0, 9, 12), 'sign_in', kamal),
    entry('3', dhakaAt(1, 17, 40), 'staff_deactivated', rumana, { active: false }),
    entry('2', dhakaAt(1, 14, 15), 'sign_in_failed', null, null, 'failure'),
    entry('1', dhakaAt(1, 11, 3), 'product_created', rumana, {
      name: bn ? 'সিল্ক শাড়ি' : 'Silk saree',
      price: '4200.00',
      variants: 1,
    }),
  ];
}

/** An entry from the week before, the page "Show earlier" brings. */
export function earlierActivity(language: Language): ActivityFixture[] {
  return [entry('0', dhakaAt(7, 12, 0), 'sign_in', language === 'bn' ? 'রুমানা' : 'Rumana')];
}

/**
 * The page the server returns for the chips' query: the actions asked for, or the result, newest first. The first
 * page has a cursor to the older one, as the prototype's "Show earlier" draws.
 */
export function activityAnswer(
  url: URL,
  entries: ActivityFixture[],
  earlier: ActivityFixture[],
): unknown {
  const actions = url.searchParams.get('action')?.split(',') ?? [];
  const result = url.searchParams.get('result');
  const older = url.searchParams.has('cursor');
  const matching = (older ? earlier : entries).filter(
    (each) =>
      (actions.length === 0 || actions.includes(each.action)) &&
      (result === null || each.result === result),
  );
  return {
    entries: matching,
    nextCursor: !older && matching.length > 0 && earlier.length > 0 ? 'older' : null,
    retentionDays: 30,
  };
}
