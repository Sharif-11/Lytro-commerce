// SEC-02: every shop-owned route and the isolation case that proves it refuses another shop's IDs.
//
// Add an entry in the same pull request as the route. The suite fails when:
//   - a shop-owned route has no entry (the endpoint shipped without its isolation case), or
//   - an entry has no matching route (the endpoint was removed or renamed).
//
// Key: "METHOD /path", exactly as the route is registered (for example "GET /orders/:id").
// Value: what the case checks. Every case expects `not_found` for another shop's ID (TEN-03).
//
// GET /me: a dashboard call naming a shop the person doesn't belong to answers 404 (TEN-31), and the summary shows only
// the shop the call names. Checked over HTTP in test/dashboard.e2e.spec.ts and test/staff.e2e.spec.ts.
// The identity routes: a signed-in account can list, add and remove only its own identities (AUTH-26). Checked in
// test/identities.e2e.spec.ts, including a removal of another account's identity, which answers 404.
export const ISOLATION_REGISTRY: Readonly<Record<string, string>> = {
  'GET /me':
    'naming a shop the person does not belong to answers 404; summary shows only the named shop',
  'GET /me/identities': 'lists only the session account identities',
  'POST /me/identities/code': 'code is sent to the session account only',
  'POST /me/identities/verify':
    'adds an identity to the session account only; a held identity is refused',
  'POST /me/identities/oauth/:provider/start':
    'attaches the provider account to the session account only',
  'DELETE /me/identities/:id': 'another account identity answers 404; the last identity is refused',
  // The staff routes: a shop lists, adds and changes only its own staff. Checked in test/staff.e2e.spec.ts.
  'GET /staff': 'lists only the session shop staff and seats',
  'POST /staff': 'creates staff in the session shop only; seats are counted in that shop',
  'PATCH /staff/:id': 'another shop staff member answers 404',
  // Checked in test/staff.e2e.spec.ts: another shop cannot reset a staff password.
  'POST /staff/:id/password': 'another shop staff member answers 404',
  // Checked in test/staff.e2e.spec.ts: roles are the shop's own, and a held role cannot be deleted.
  'GET /roles': 'lists only the session shop roles and holder counts',
  'POST /roles': 'creates a role in the session shop only',
  'PATCH /roles/:id': 'another shop role answers 404',
  'DELETE /roles/:id': 'another shop role answers 404; a held role is refused',
  // Checked in test/activity.e2e.spec.ts: a shop sees only its own activity log entries.
  'GET /activity': 'lists only the session shop activity log',
  // Checked in test/balance-ledger.e2e.spec.ts: a shop's balance and ledger are its own (BAL-01, tenant.balance_ledger's RLS).
  'GET /balance': "shows only the session shop's own balance and frozen flag",
  'GET /balance/ledger': "lists only the session shop's own ledger entries",
  'GET /balance/ledger/export': "exports only the session shop's own ledger entries",
  // Platform-wide data (control.rates), not tenant-owned: every shop sees the same values, so there is nothing
  // to isolate between tenants — included here only because the route is shop-reachable, not SkipTenant.
  'GET /balance/current-rates':
    'returns the same platform-wide rates regardless of which shop calls it',
  // Platform-wide data (control.platform_wallets), not tenant-owned, same reasoning as current-rates above
  // (BIL-02, BAL-03). Checked in test/platform-wallets.e2e.spec.ts.
  'GET /platform-wallets':
    'returns the same platform-wide enabled wallets regardless of which shop calls it',
  // Checked in test/essential-sms-usage.e2e.spec.ts: a shop's own sign-in-OTP usage never raises another shop's.
  'GET /balance/essential-sms': "shows only the session shop's own essential-SMS usage (AUTH-21)",
  // Checked in test/plan-purchase.e2e.spec.ts: a shop's quotes, invoices and top-ups are its own.
  'POST /balance/top-up/quote': 'creates a top-up quote scoped to the session shop only',
  'POST /balance/top-up/confirm': "another shop's top-up payment id answers not_found",
  // Checked in test/payment-requests.e2e.spec.ts: a shop closes only its own request (BIL-19).
  'POST /balance/top-up/:id/cancel': "another shop's top-up payment id answers not_found",
  'POST /billing/quote': 'creates a purchase quote scoped to the session shop only',
  'POST /billing/auto-renew': "toggles only the session shop's own auto-renew setting",
  'POST /billing/purchase': "another shop's payment id answers not_found",
  'GET /billing/invoices': "lists only the session shop's own invoices",
  'GET /billing/invoices/:id': "another shop's invoice id answers not_found",
  // Checked in test/billing-payments.e2e.spec.ts: a shop's payments to the platform are its own (BIL-19).
  'GET /billing/payments':
    "lists only the session shop's own payments (and its owner's earlier shops')",
  // Checked in test/payment-requests.e2e.spec.ts: a shop closes only its own request, and prices only its own plan.
  'POST /billing/payments/:id/cancel': "another shop's payment id answers not_found",
  'GET /billing/prices': "prices against the session shop's own plan and add-ons only",
  'POST /billing/upgrade/quote': 'creates an upgrade quote scoped to the session shop only',
  'POST /billing/upgrade/confirm': "another shop's payment id answers not_found",
  // Checked in test/plan-downgrade.e2e.spec.ts: a shop schedules, previews, cancels and reads only its own.
  'POST /billing/downgrade/preview': "previews against the session shop's own plan only",
  'POST /billing/downgrade/schedule': 'schedules a downgrade scoped to the session shop only',
  'POST /billing/downgrade/cancel': "cancels only the session shop's own scheduled downgrade",
  'GET /billing/cancellation': "returns only the session shop's own cancellation status",
  'GET /billing/downgrade': "returns only the session shop's own scheduled downgrade",
  'POST /billing/pay-as-you-go':
    "switches or schedules only the session shop's own move to pay-as-you-go",
  'POST /billing/close':
    "closes only the session shop's own pay-as-you-go shop, and only for its owner",
  // Checked in test/lifecycle.e2e.spec.ts: a shop cancels/undoes only its own subscription.
  'POST /billing/cancel': "cancels only the session shop's own subscription",
  'POST /billing/cancel/undo': "undoes only the session shop's own cancellation",
  // Checked in test/shop-settings.e2e.spec.ts: a shop's own contact details only (TEN-30).
  'GET /shop-settings': "reads only the session shop's own contact details",
  'PATCH /shop-settings': "shop A's owner naming shop B answers 404, never updates shop B",
  // Checked in test/data-export.e2e.spec.ts: a shop's own export requests and files only (LIF-16/17).
  'POST /exports': 'creates an export request scoped to the session shop only',
  'GET /exports': "lists only the session shop's own export requests",
  // Slice 11, checked in test/dashboard-reads.e2e.spec.ts: Home counts and the checklist's tick are the session shop's.
  'GET /home': "counts only the session shop's own products, batches, balance, payments and staff",
  'POST /home/link-shared': "records the share on the session shop's own settings only",
  'GET /exports/:id/download': "another shop's export id answers not_found, never its content",
  // Checked in test/catalogue-products.e2e.spec.ts and test/catalogue-library.e2e.spec.ts (Phase 3 Slice 1), and at the
  // data layer in test/catalogue-db.e2e.spec.ts. GET /presets is platform data, the same for every shop.
  'GET /presets': 'returns the same platform-wide shop types regardless of which shop calls it',
  'GET /product-defaults':
    "the session shop's own business type, or its own category's behaves-like, decides the defaults; another shop's category answers 404",
  'PUT /business-type': "sets only the session shop's own business type",
  'GET /attributes':
    "lists the platform's attributes and only the session shop's own, never another shop's",
  'POST /attributes': 'creates an attribute in the session shop only',
  'PATCH /attributes/:id': "another shop's attribute (or a platform one) answers 404",
  'POST /attributes/:id/options':
    "another shop's attribute answers 404; the option is the session shop's own",
  'PATCH /attributes/:id/options/:optionId': "another shop's option answers 404",
  'GET /categories': "lists only the session shop's own categories",
  'POST /categories':
    'creates a category in the session shop only; another shop as parent answers not_found',
  'PATCH /categories/:id': "another shop's category answers 404",
  'DELETE /categories/:id': "another shop's category answers 404",
  'PUT /categories/:id/attributes':
    "another shop's category answers 404; another shop's attribute is not_found",
  'GET /products': "lists only the session shop's own products",
  'POST /products':
    "creates in the session shop only; another shop's category, attribute or option ids are not_found",
  'GET /products/:id': "another shop's product answers 404",
  'PATCH /products/:id': "another shop's product answers 404",
  'DELETE /products/:id': "another shop's product answers 404, archived or hard",
  'PUT /products/:id/variants': "another shop's product answers 404",
  'PUT /products/:id/attributes': "another shop's product answers 404",
  'PUT /products/:id/slug': "another shop's product answers 404",
  // Phase 3 Slice 1b, checked in test/catalogue-extras.e2e.spec.ts.
  'POST /attributes/:id/options/batch':
    "another shop's attribute answers 404; the values it adds are the session shop's own",
  'PUT /categories/:id/size-chart': "another shop's category answers 404",
  'DELETE /categories/:id/size-chart': "another shop's category answers 404",
  'POST /products/:id/duplicate':
    "another shop's product answers 404; the copy is the session shop's own",
  // Phase 3 Slice 11.7a, checked in test/catalogue-products.e2e.spec.ts.
  'POST /products/:id/restore': "another shop's product answers 404 and stays archived",
  'PUT /products/:id/size-chart': "another shop's product answers 404",
  'DELETE /products/:id/size-chart': "another shop's product answers 404",
  'GET /option-sets': "lists the platform's option sets and only the session shop's own",
  'POST /option-sets': 'saves the set in the session shop only',
  'DELETE /option-sets/:id': "another shop's set (or a platform one) answers 404",
  // Phase 3 Slice 1c, checked in test/delivery.e2e.spec.ts.
  'GET /locations': 'returns the same platform-wide list regardless of which shop calls it',
  'GET /delivery-zones': "lists only the session shop's own zones",
  'GET /delivery-zones/resolve': "resolves against the session shop's own zones only",
  'PUT /delivery-zones/home-area': "sets only the session shop's own home zone",
  'POST /delivery-zones': 'creates a zone in the session shop only',
  'PATCH /delivery-zones/:id': "another shop's zone answers 404",
  'PUT /delivery-zones/:id/areas': "another shop's zone answers 404",
  'DELETE /delivery-zones/:id': "another shop's zone answers 404",
  'PUT /products/:id/delivery-zones':
    "another shop's product answers 404; another shop's zone is not_found",
  // Phase 3 Slice 2a, checked in test/inventory.e2e.spec.ts.
  'GET /products/:id/stock': "another shop's product answers 404",
  'PUT /products/:id/variants/:variantId/stock': "another shop's product or variant answers 404",
  'PUT /products/:id/variants/:variantId/cost': "another shop's product or variant answers 404",
  'POST /products/:id/variants/:variantId/stock-additions':
    "another shop's product or variant answers 404",
  'GET /products/:id/variants/:variantId/stock-history':
    "another shop's product or variant answers 404",
  // Phase 3 Slice 2b, checked in test/inventory.e2e.spec.ts.
  'POST /stock-checks': "another shop's variant is not_found, and nothing is recorded",
  'GET /stock-checks': "lists only the session shop's own checks",
  'GET /stock-checks/:id': "another shop's check answers 404",
  'GET /inventory/figures': "sums only the session shop's own stock and movements",
  // Phase 3 Slice 11.9, checked in test/stock-page.e2e.spec.ts.
  'GET /inventory/stock': "lists only the session shop's own products and their stock",
  // Phase 3 Slice 3a, checked in test/inventory.e2e.spec.ts.
  'GET /products/:id/batches': "another shop's product answers 404",
  'POST /products/:id/batches/:batchId/write-off': "another shop's product or batch answers 404",
  'GET /batches': "lists only the session shop's own batches",
  // Phase 3 Slice 3b, checked in test/inventory.e2e.spec.ts.
  'GET /products/:id/variants/:variantId/serials': "another shop's product or variant answers 404",
  'POST /products/:id/variants/:variantId/serials': "another shop's product or variant answers 404",
  'PATCH /products/:id/serials/:serialId': "another shop's product or serial answers 404",
  'DELETE /products/:id/serials/:serialId': "another shop's product or serial answers 404",
  // Phase 3 Slice 11.7c, checked in test/inventory.e2e.spec.ts.
  'POST /serials/check': "only the session shop's units count as taken; another shop's never do",
  // Phase 3 Slice 4a, checked in test/purchasing.e2e.spec.ts.
  'GET /suppliers': "lists only the session shop's own suppliers",
  'POST /suppliers': 'creates a supplier in the session shop only; names are unique per shop',
  'GET /suppliers/:id': "another shop's supplier answers 404",
  'PATCH /suppliers/:id': "another shop's supplier answers 404",
  'GET /purchase-orders': "lists only the session shop's own purchases",
  'POST /purchase-orders': "another shop's variant or supplier is not_found, and nothing is saved",
  'GET /purchase-orders/:id': "another shop's purchase answers 404",
  'PATCH /purchase-orders/:id': "another shop's purchase, variant or supplier answers 404",
  'POST /purchase-orders/:id/place': "another shop's purchase answers 404",
  'POST /purchase-orders/:id/cancel': "another shop's purchase answers 404",
  'DELETE /purchase-orders/:id': "another shop's purchase answers 404",
  // Phase 3 Slice 4b, checked in test/purchasing.e2e.spec.ts.
  'POST /purchase-orders/:id/receipts':
    "another shop's purchase answers 404; another purchase's item is not_found",
  'POST /purchase-orders/:id/close': "another shop's purchase answers 404",
  'GET /products/:id/variants/:variantId/purchases':
    "another shop's product or variant answers 404",
  // Phase 3 Slice 8, checked in test/api-keys.e2e.spec.ts: a shop's API keys are its own.
  'GET /api-keys': "lists only the session shop's own keys",
  'POST /api-keys': 'makes a key for the session shop only; the 20-key limit counts that shop',
  'PATCH /api-keys/:id': "another shop's key answers 404",
  'POST /api-keys/:id/revoke': "another shop's key answers 404 and keeps working",
  // Phase 3 Slice 6a, checked in test/media.e2e.spec.ts: a shop's media is its own, and only its own ready images
  // can be attached anywhere (DAT-02, the database's media_ready_image).
  'POST /media/uploads':
    "starts an upload for the session shop only; another shop's place is not_found",
  'POST /media/:id/finish': "another shop's item answers 404",
  'GET /media': "lists only the session shop's own ready media",
  'GET /media/usage': "counts only the session shop's own stored files",
  'GET /media/:id': "another shop's item answers 404",
  'DELETE /media/:id': "another shop's item answers 404 and stays",
  'PUT /products/:id/images':
    "another shop's product answers 404; another shop's image is not_found",
  // Phase 3 Slice 6b, checked in test/media-video.e2e.spec.ts.
  'PUT /products/:id/video':
    "another shop's product answers 404; another shop's video is not_found",
  'PUT /shop-settings/logo': "sets only the session shop's logo; another shop's image is not_found",
  // Phase 3 Slice 7b, checked in test/media-bandwidth.e2e.spec.ts.
  'GET /media/bandwidth': "counts only the session shop's own cycle and days",
  // Phase 3 Slice 10, checked in test/usage.e2e.spec.ts.
  'GET /usage': "counts only the session shop's own products, seats, media, requests and SMS",
  // Phase 3 Slice 10, checked in test/downgrade-checklist.e2e.spec.ts.
  'GET /billing/downgrade/checklist': "shows only the session shop's own downgrade and counts",
  // Phase 3 Slice 10a.1, checked in test/addons.e2e.spec.ts: the catalogue is platform-wide, the prices and purchases the
  // shop's own.
  'GET /addons':
    "prices the platform-wide catalogue against the session shop's own period and limits",
  'GET /addons/mine': "lists only the session shop's own add-ons",
  'POST /addons/quote': 'creates an add-on quote scoped to the session shop only',
  'POST /addons/purchase': "another shop's payment id answers not_found",
  // Phase 3 Slice 10a.2, checked in test/addon-renewal.e2e.spec.ts.
  'PATCH /addons/mine/:id': "another shop's add-on answers not_found",
  // Phase 3 Slice 10a.3, checked in test/addon-packs.e2e.spec.ts: packs and the switches are the session shop's own.
  'POST /addons/packs': "buys into the session shop's own balance and cycle only",
  'PATCH /addons/auto-buy': "sets only the session shop's own auto-buy switches",
  // The public API (API-10, TEN-02): the shop comes from the key alone, whatever the request names.
  'GET /public/shop': "answers the key's own shop only; a shop id sent with the request is ignored",
  // Phase 3 Slice 9a, checked in test/public-catalogue.e2e.spec.ts: the catalogue of the key's shop only.
  'GET /public/catalogue/version': "the key's own shop's version only",
  'GET /public/catalogue/products': "lists and searches only the key's own shop's active products",
  'GET /public/catalogue/products/:slug': "another shop's product, by its link, is not found",
  'GET /public/catalogue/categories': "only the key's own shop's visible categories",
  // Phase 3 Slice 12a, checked in test/storefront.e2e.spec.ts: the delivery estimate prices the key's own shop's items
  // only; the thana list is the same platform-wide list for every shop.
  'GET /public/locations': 'returns the same platform-wide thana list whichever key asks',
  'POST /public/delivery-estimate':
    "another shop's variant is not_found; zones are the key's own shop's",
  // Phase 4 Slice 4.2, checked in test/public-orders.e2e.spec.ts.
  'POST /public/orders': "another shop's variant is not_found; the order is the key's own shop's",
  'GET /public/track/:trackingId': "another shop's order, by its tracking ID, is not_found",
  // Phase 3 Slice 9b, checked in test/ad-tracking-feed.e2e.spec.ts.
  'GET /ad-tracking': "shows only the session shop's own ad tracking",
  'PUT /ad-tracking': "sets only the session shop's own ad tracking",
  'DELETE /ad-tracking': "removes only the session shop's own ad tracking",
  'GET /catalog-feed': "shows only the session shop's own feed link",
  'POST /catalog-feed/regenerate': "replaces only the session shop's own feed link",
  'GET /public/feeds/meta/:file':
    "a feed is the token's own shop's only; another token or none is not found",
  // Phase 3 Slice 11.2, checked in test/brand.e2e.spec.ts.
  'GET /brand': "reads only the session shop's own brand identity",
  'PUT /brand': "saves only the session shop's identity; another shop's image is not_found",
  'PUT /brand/switch': "switches only the session shop's own identity",
  // Phase 3 Slice 13, checked in test/custom-domains.e2e.spec.ts: a shop's own domain is its own.
  'GET /domain': "reads only the session shop's own domain",
  'POST /domain': 'adds a domain to the session shop only; one active on another shop is taken',
  'POST /domain/check': "checks only the session shop's own domain",
  'DELETE /domain': "removes only the session shop's own domain; another shop's is untouched",
  // Phase 4 Slice 4.1, checked in test/orders.e2e.spec.ts: a shop's orders are its own.
  'GET /orders': "lists and searches only the session shop's own orders",
  'POST /orders':
    "another shop's variant is not_found and nothing is saved; a key is the session shop's own",
  'POST /orders/quote': "another shop's variant is not_found",
  'GET /orders/:id': "another shop's order answers 404",
  'PATCH /orders/:id': "another shop's order answers 404",
  'POST /orders/:id/calls': "another shop's order answers 404",
  'POST /orders/:id/cancel': "another shop's order answers 404 and keeps its stock held",
  'POST /orders/:id/override': "another shop's order answers 404",
  // Phase 4 Slice 4.3, checked in test/order-fulfilment.e2e.spec.ts.
  'POST /orders/:id/ship': "another shop's order answers 404 and keeps its stock held",
  'POST /orders/:id/hand-over': "another shop's order answers 404",
  'POST /orders/:id/deliver': "another shop's order answers 404",
  'POST /orders/:id/returns': "another shop's order answers 404",
  'DELETE /orders/:id': "another shop's order answers 404 and is kept",
};
