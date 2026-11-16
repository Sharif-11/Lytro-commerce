// The seeder's first step (deploy/load/run/seed.sh), Phase 9 Slice 9.10: the load test's shops, signed up as sellers
// sign up, through a phone code the outside services' stand-in received. Who they are goes to the roster, the file the
// later steps and the load read. Runs through the internal edge (EDGE), so each seller has a visitor address of their
// own, as TRIAL_LIMIT_PER_IP needs.
import { signUp } from './lib/dashboard.js';
import { personOf, phoneOf } from './lib/people.js';
import { visitorAddress } from './lib/target.js';

const SHOPS = Number(__ENV.SHOPS || 100);
// A short name for this seeding, in every shop's address: two seedings never collide.
const RUN = __ENV.RUN || 'lt';

export const options = { setupTimeout: '60m', vus: 1, iterations: 1, summaryTrendStats: ['p(95)'] };

export function setup() {
  const shops = [];
  const failed = [];
  for (let index = 0; index < SHOPS; index += 1) {
    const slug = `${RUN}-s${String(index).padStart(3, '0')}`;
    const result = signUp({
      phone: phoneOf(0, index),
      ownerName: personOf(index),
      shopName: `Load test shop ${String(index)}`,
      slug,
      visitor: visitorAddress(10_000 + index),
    });
    if (result.failed) {
      failed.push(`${slug}: ${result.failed}`);
      continue;
    }
    result.seller.send('PUT', '/business-type', { businessType: 'clothing' });
    shops.push({ index, ...result.seller.toJSON() });
  }
  return { run: RUN, shops, failed };
}

export default function noLoad() {
  // Everything happens in setup: one seller after another, written to the roster as one list.
}

export function handleSummary(data) {
  const roster = data.setup_data ?? { shops: [], failed: ['no setup data'] };
  const line = `signed up ${String(roster.shops.length)} of ${String(SHOPS)} shops; failed: ${String(roster.failed.length)}\n${roster.failed.slice(0, 10).join('\n')}\n`;
  return { [__ENV.ROSTER || 'out/shops.json']: JSON.stringify(roster), stdout: line };
}
