// OBS-08 (Phase 9 Slice 9.6): the order probe, a scripted check that Grafana Cloud's synthetic monitoring runs every 15
// minutes from outside Lytro's servers, paging when it fails. Through the probe shop's public key it places an order,
// which opens the order's payment session (the probe shop takes an advance on every order), then reads the order's
// tracking: the three steps OBS-08 names, as a shop's own website takes them.
//
// The probe shop, its key and the values below: RUNBOOKS.md, "The order probe". The key is a public one, made to sit in
// a web page, so it may sit here. Paste this file into the check after filling them in, one check per server.
import { check, fail } from 'k6';
import http from 'k6/http';

// Production's; staging's is https://api.staging.lytro.app/v1.
const API = 'https://api.lytro.app/v1';
// The probe shop's public key, and the website it's registered for (API-23: a key answers its own sites only).
const KEY = 'lytro_pk_FILL_IN';
const SITE = 'https://probe.lytro.app';
// One of the probe shop's product variants with stock it never runs out of, and a delivery area's location ID.
const VARIANT_ID = 'FILL_IN';
const LOCATION_ID = 0;
// The owner's own phone: the probe shop sends no SMS, but if one were ever turned on, it reaches nobody else.
const PHONE = '01XXXXXXXXX';

const headers = { Authorization: `Bearer ${KEY}`, Origin: SITE };

export default function probe() {
  const order = {
    customerName: 'Lytro probe',
    phone: PHONE,
    locationId: LOCATION_ID,
    deliveryAddress: 'The order probe: not a real order',
    items: [{ variantId: VARIANT_ID, quantity: 1 }],
    payment: { returnUrl: `${SITE}/paid` },
  };
  const placed = http.post(`${API}/orders`, JSON.stringify(order), {
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      // API-11: each run its own order.
      'Idempotency-Key': `probe-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    },
  });
  if (!check(placed, { 'the order is placed': (response) => response.status === 201 })) {
    fail(`placing the order answered ${placed.status}`);
  }
  const trackingId = placed.json('data.trackingId');
  if (
    !check(placed, {
      'its payment session opened': (response) => response.json('data.payment') !== null,
    })
  ) {
    fail('the order opened no payment session');
  }

  const tracked = http.get(`${API}/track/${trackingId}`, { headers });
  if (
    !check(tracked, {
      'its tracking reads': (response) =>
        response.status === 200 && response.json('data.trackingId') === trackingId,
    })
  ) {
    fail(`tracking the order answered ${tracked.status}`);
  }
}
