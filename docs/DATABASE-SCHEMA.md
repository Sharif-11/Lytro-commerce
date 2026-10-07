# Database schema design — full platform

Status: draft v1, for review before implementation. PostgreSQL 16+. Companion to `SRS.md` / `SRS-detailed.md`; requirement IDs are cited throughout so this design stays traceable.

**Scope.** Every module in the SRS: multi-tenant foundation, catalogue, orders, couriers, payments, balance/billing (including plan lifecycle, add-ons, pay-as-you-go), SMS and notifications, chat and AI, fraud checking, the SMS listener app, tenant-configured webhooks, the notice board, and the operator console. Sections 1–5 are the foundation (unchanged from the first draft); sections 6 onward add every remaining module. This is still a design for **Path A's build order** to follow — build the foundation first, the rest in whatever sequence you choose — but every table now exists on paper so nothing downstream gets redesigned later.

**How every earlier scalability decision shows up here**, so it's easy to check nothing was dropped:

| Decision | Where it appears below |
| --- | --- |
| Control-plane schema separate from tenant data (SCL-06) | Two schemas: `control` and `tenant`, no cross-schema FKs except by value |
| Cell identifier, always 1 at launch (SCL-07) | `cell_id` on `control.tenants`, read by the app, not joined on yet |
| Row-level security (DAT-03) | Policy on every `tenant.*` table, keyed to a session variable |
| One primary server at launch, read/write pool split from day one (DAT-19, DAT-56) | Called out in connection notes, not a schema concern but affects how the app opens connections |
| Canonical location list + courier mapping, decoupled (CUS-08/10/11/12) | `control.locations` and `control.courier_location_map`, both platform-wide |
| Catalogue version for cache invalidation (CCH-02) | `tenant.catalogue_state` |
| Order creation unlimited, only handling counted (QTA-01/05/07) | `tenant.orders.handled_at` is the single column the counters key off |
| Delivery-charge Default/Adjustable modes (PRD-16, ORD-06a) | Columns on `tenant.products` / `tenant.product_variants` |
| Multi-identity sign-up, one tenant per channel (AUTH-08, TEN-15) | `control.subscriber_identities` with a unique link to at most one tenant per identity |
| Order line snapshots, never live references (ORD-46) | `tenant.order_lines` stores full copies, FK to product/variant is nullable and advisory only |
| Money never floating point (DAT-05) | `numeric(12,2)` throughout for money, `numeric(10,3)` for weight |

---

## 1. Two schemas, one database at launch

```
control.*   -- platform-wide: subscribers, tenants, plans, rates, canonical reference data
tenant.*    -- every table carries tenant_id; row-level security enforces isolation
```

At launch both live in the same PostgreSQL instance. The split is what lets a future cell (SCL-10) become "a `tenant` schema's worth of data, on its own server, with `control` staying central or being partitioned by cell" without redesigning tables — only where they're hosted changes.

**Rule enforced by convention and reviewed in migrations, not by the database itself:** application code never joins `control.*` to `tenant.*` directly in a query. Anything a tenant-scoped query needs from `control` (plan limits, rate values, canonical location names) is read separately and passed in, or cached. This is what SCL-06 requires ("no cross-schema joins in application code except through a module interface").

---

## 2. `control` schema

### 2.1 Identity and subscribers

```sql
CREATE TABLE control.subscribers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    password_hash   text,                -- null for an OAuth-only subscriber (AUTH-24)
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_sign_in_at timestamptz
);

CREATE TYPE control.identity_kind AS ENUM ('phone', 'email', 'google', 'facebook');

CREATE TABLE control.subscriber_identities (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id   uuid NOT NULL REFERENCES control.subscribers(id),
    kind            control.identity_kind NOT NULL,
    value           text NOT NULL,        -- normalised phone (AUTH-02), lowercased email, or Facebook account id
    verified_at     timestamptz,          -- null while a staff phone waits for its owner's first code sign-in (D22)
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- AUTH-08: each kind is independently unique platform-wide, never cross-checked against the other kinds
    UNIQUE (kind, value)
);
CREATE INDEX ON control.subscriber_identities (subscriber_id);
```

Why identities are their own table rather than three nullable columns on `subscribers`: AUTH-26 lets a subscriber add a second or third identity to the *same* account later (for recovery redundancy), which is a different thing from TEN-15's "one tenant per channel" rule below — modelling identities as rows lets both coexist without special-casing.

### 2.1a Sessions, one-time codes and sign-in failures

```sql
CREATE TABLE control.sessions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash          text NOT NULL UNIQUE,            -- SHA-256 of the cookie value, never the value (SEC-07)
    csrf_hash           text NOT NULL,                   -- SHA-256 of the per-session CSRF token (SEC-14)
    subscriber_id       uuid NOT NULL REFERENCES control.subscribers(id),
    tenant_id           uuid REFERENCES control.tenants(id),  -- null only between identity verification and shop creation (D13)
    user_id             uuid,                            -- staff user; null for the owner
    must_set_password   boolean NOT NULL DEFAULT false,  -- AUTH-19: blocks the dashboard until a password is saved
    sign_in_method      text NOT NULL DEFAULT 'code',    -- code | password | reset (AUTH-20)
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL,            -- seven days after sign-in (D1)
    revoked_at          timestamptz,
    user_agent          text,
    ip                  inet                             -- the client address behind the edge (D14)
);

CREATE TABLE control.verification_challenges (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           text NOT NULL,
    kind            text NOT NULL DEFAULT 'signin',      -- signin | reset (AUTH-17)
    code_hash       text NOT NULL,                       -- keyed hash, never the code (AUTH-05)
    attempts        integer NOT NULL DEFAULT 0,          -- AUTH-06: five wrong codes lock the challenge
    locked_until    timestamptz,
    expires_at      timestamptz NOT NULL,                -- five minutes (AUTH-05)
    consumed_at     timestamptz,                         -- single use
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.sign_in_failures (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id   uuid REFERENCES control.subscribers(id),  -- null when the number has no account
    ip              inet,                                     -- the client address (D14); stored, not used for the lock
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON control.sign_in_failures (subscriber_id, created_at);
```

AUTH-14: five failures for one account in fifteen minutes lock it. The count is taken over a sliding window from `sign_in_failures`, so old failures age out and nothing needs resetting.

### 2.1b OAuth sign-in states

```sql
CREATE TABLE control.oauth_states (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state                   text NOT NULL UNIQUE,         -- single use (AUTH-24)
    provider                text NOT NULL,                -- google | facebook
    code_verifier           text NOT NULL,                -- PKCE verifier, never sent to the browser
    attach_to_subscriber_id uuid REFERENCES control.subscribers(id),  -- set when adding a provider to a signed-in account (AUTH-26)
    expires_at              timestamptz NOT NULL,         -- ten minutes
    consumed_at             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now()
);
```

The owner of a shop may be enrolled by phone, by email, or by a provider account. The owner's staff row (`tenant.users`) holds the phone or the email, whichever exists; its phone is nullable and its email is unique per shop (migration 0011).

### 2.2 Tenants

```sql
CREATE TYPE control.tenant_state AS ENUM
    ('trial', 'pay_as_you_go', 'active', 'grace', 'read_only', 'locked', 'archived', 'deleted');

CREATE TABLE control.tenants (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- TEN-15 / OD-53: a tenant is created from exactly one identity; the UNIQUE constraint on
    -- owner_identity_id is what enforces "at most one tenant per identity channel" — a second
    -- tenant creation attempt with the same identity fails at the database, not just in application code.
    owner_identity_id   uuid NOT NULL UNIQUE REFERENCES control.subscriber_identities(id),
    subscriber_id       uuid NOT NULL REFERENCES control.subscribers(id),
    cell_id             integer NOT NULL DEFAULT 1,      -- SCL-07: always 1 at launch
    shop_name           varchar(60) NOT NULL,             -- SEC-06/AUTH-01 cap
    slug                varchar(30) NOT NULL UNIQUE,       -- AUTH-11, immutable after creation
    state               control.tenant_state NOT NULL DEFAULT 'trial',
    plan_id             uuid REFERENCES control.plans(id),
    plan_snapshot        jsonb,                            -- PLN-02: frozen limits/features at purchase
    period_start         timestamptz,
    period_end            timestamptz,
    balance_amount        numeric(12,2) NOT NULL DEFAULT 0,  -- BAL-01: one balance per subscriber; since
                                                              -- subscriber:tenant is 1:1 (AUTH-10), it lives
                                                              -- here rather than duplicated in `control.subscribers`
    balance_frozen         boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    suspended_at           timestamptz,
    suspended_reason       text,
    kyc_status             text NOT NULL DEFAULT 'unverified'   -- KYC-16: unverified | pending | verified | revoked
                           CHECK (kyc_status IN ('unverified', 'pending', 'verified', 'revoked'))
);
CREATE INDEX ON control.tenants (subscriber_id);
CREATE INDEX ON control.tenants (state);
CREATE INDEX ON control.tenants (cell_id);

CREATE TABLE control.tenant_domains (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    hostname        text NOT NULL UNIQUE,        -- TEN-12: a domain belongs to one tenant platform-wide
    status          text NOT NULL DEFAULT 'pending', -- pending | active | failed | removed
    verified_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON control.tenant_domains (tenant_id);
-- TEN-24/25/27: this table plus tenants.slug is the entire data the host resolver reads,
-- cached in process memory for ~60s per TEN-27.
```

### 2.3 Plans, billing terms, rates

```sql
CREATE TABLE control.plans (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    rank            integer NOT NULL,           -- PLN-16: unique among for-sale plans
    for_sale        boolean NOT NULL DEFAULT true, -- PLN-10: not-for-sale plans never returned to tenants
    version         integer NOT NULL DEFAULT 1,
    limits          jsonb NOT NULL,             -- seats, products, storage, bandwidth, order-handling, etc (2.1)
                                                 -- `staff` counts the owner: Trial 1 (owner only), Starter 2 (D21);
                                                 -- a plan with no `staff` key gets 1 seat
    features        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.billing_terms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label           text NOT NULL,
    months          integer NOT NULL CHECK (months BETWEEN 1 AND 60),
    visible         boolean NOT NULL DEFAULT true,
    default_discount_pct numeric(5,2),
    retired_at      timestamptz
);

CREATE TABLE control.plan_prices (
    plan_id         uuid NOT NULL REFERENCES control.plans(id),
    billing_term_id uuid NOT NULL REFERENCES control.billing_terms(id),
    price           numeric(10,2) NOT NULL,
    PRIMARY KEY (plan_id, billing_term_id)
);

CREATE TABLE control.rates (
    key             text PRIMARY KEY,           -- 'sms_per_unit', 'ai_reply', 'fraud_check',
                                                  -- 'payg_order_fee_min', 'payg_order_fee_pct',
                                                  -- 'payg_product_fee', 'sms_unit_size_chars' (RAT-13)
    value           numeric(12,4) NOT NULL,
    effective_from  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE control.rate_history (
    id              bigserial PRIMARY KEY,
    key             text NOT NULL,
    old_value       numeric(12,4),
    new_value       numeric(12,4) NOT NULL,
    changed_by      uuid,                        -- operator account id
    changed_at      timestamptz NOT NULL DEFAULT now()
);
-- RAT-01..14: a charge always reads control.rates at the moment it's recorded; rate_history
-- is append-only and never consulted for billing, only for the "current rates" / audit screen.
```

### 2.4 Invoices and platform audit

```sql
CREATE TABLE control.invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    number          bigint NOT NULL UNIQUE,      -- gap-free, from a locked counter row, not a sequence (DAT-07)
    plan_snapshot   jsonb NOT NULL,
    amount          numeric(10,2) NOT NULL,
    billing_term_label text NOT NULL,
    issued_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.invoice_counters (
    id  smallint PRIMARY KEY DEFAULT 1,
    next_number bigint NOT NULL DEFAULT 1
);
-- BIL-12/DAT-07: invoice number is taken from this single locked row inside the same
-- transaction as the insert, never a native sequence.

CREATE TABLE control.platform_audit_log (
    id              bigserial PRIMARY KEY,
    actor_type      text NOT NULL,               -- operator | system
    actor_id        uuid,
    action          text NOT NULL,
    target_type     text,
    target_id       uuid,
    result          text NOT NULL,
    ip              inet,
    summary         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- AUD/ADM: insert-only at the database role level (no UPDATE/DELETE grant), same pattern as
-- tenant.activity_log below.

-- Added 2026-10-02: ADM-11 ("platform settings shall be editable by the operator with an audit
-- trail") and DAT-01 ("platform settings" live in PostgreSQL) were never given an actual table
-- until now. Holds every platform-wide editable value referenced elsewhere by name: RAT-01's
-- per-use rates, LIF-26's lifecycle stage lengths, BAL-04's top-up min/max, QTA/RTE thresholds,
-- and anything bracketed as [editable] throughout the SRS. The current value lives here; every
-- change is also written to control.platform_audit_log (actor, old value, new value, reason),
-- which is what satisfies ADM-11's audit-trail requirement rather than this table versioning
-- itself.
CREATE TABLE control.platform_settings (
    key             text PRIMARY KEY,            -- e.g. 'balance.topup_min_tk', 'balance.topup_max_tk',
                                                   -- 'rate.sms_per_part_tk', 'lifecycle.grace_days'
    value           jsonb NOT NULL,
    description     text NOT NULL,                -- shown in the operator settings screen
    updated_by      uuid NOT NULL,                -- operator user id
    updated_at      timestamptz NOT NULL DEFAULT now()
);
-- The application reads this table (cached in-process per RED-06's pattern, refreshed on a
-- short interval) rather than an environment variable or a deploy-time config file, so a change
-- here takes effect immediately for every server without a restart or redeploy (RAT-02's
-- "immediate effect" rule, generalized to every setting this table holds).
```

### 2.5 Canonical locations and courier mapping

```sql
CREATE TABLE control.locations (
    id              serial PRIMARY KEY,
    zilla           text NOT NULL,
    thana           text NOT NULL,
    UNIQUE (zilla, thana)
);
-- CUS-08: one platform-wide list, seeded once from the standard 64-district dataset,
-- identical for every tenant regardless of which couriers it has connected.

CREATE TABLE control.courier_location_map (
    id              serial PRIMARY KEY,
    courier_key     text NOT NULL,               -- 'steadfast', 'pathao', ...
    location_id     integer NOT NULL REFERENCES control.locations(id),
    courier_zone_code text NOT NULL,
    UNIQUE (courier_key, location_id)
);
-- CUS-10/11/12: resolved only at booking time (see tenant.orders.courier_key below);
-- adding a courier only adds rows here, never touches control.locations or any tenant address.
```

---

## 3. `tenant` schema — row-level security

Every table below has `tenant_id uuid NOT NULL` as its first real column, plus `cell_id integer NOT NULL DEFAULT 1` mirrored from the owning tenant (denormalised on write, read by the connection layer to pick the right pool once cells exist — SCL-07). Pattern, applied once per table:

```sql
ALTER TABLE tenant.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant.orders
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- The application role has no BYPASSRLS; app.tenant_id is set once per transaction
-- (SET LOCAL app.tenant_id = '...') right after the tenant is resolved (TEN-24/DAT-03).
```

### 3.1 Staff, roles

```sql
CREATE TABLE tenant.users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL,
    phone              varchar(15),             -- null for an owner who enrolled by email only (AUTH-10)
    email              varchar(254),            -- unique per shop (migration 0011)
    password_hash      text,                    -- null for the owner until a password is set
    name               text,
    is_owner           boolean NOT NULL DEFAULT false,
    active             boolean NOT NULL DEFAULT true,
    subscriber_id      uuid,                    -- the platform account behind a staff member; null for the owner (D22)
    must_set_password  boolean NOT NULL DEFAULT false,  -- STF-13: owner reset forces a change at the next sign-in
    created_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, phone),
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, id),                     -- lets user_roles prove a role and a user share a tenant
    UNIQUE (subscriber_id)                      -- STF-06: one subscriber is staff in at most one shop, platform-wide
);

CREATE TABLE tenant.roles (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    name            text NOT NULL,
    permissions     text[] NOT NULL DEFAULT '{}',  -- from the platform's permission list (validators' Permission enum)
    UNIQUE (tenant_id, name),
    UNIQUE (tenant_id, id)
);

CREATE TABLE tenant.user_roles (
    tenant_id uuid NOT NULL,
    user_id   uuid NOT NULL,
    role_id   uuid NOT NULL,
    PRIMARY KEY (tenant_id, user_id, role_id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES tenant.users(tenant_id, id),
    FOREIGN KEY (tenant_id, role_id) REFERENCES tenant.roles(tenant_id, id)
);
```

A staff member's phone is reserved as a platform identity when they are added, and the subscriber link is what makes the platform-wide STF-06 check possible: the unique constraint on `subscriber_id` spans every shop. The phone identity starts pending (`verified_at` null in `control.subscriber_identities`) and is proven by the person's first code sign-in (D22). Staff sign in separately from the owner, at `POST /auth/staff/signin` on the shop's own host, with the password on this table, never the account password (D23).

### 3.2 Catalogue

```sql
CREATE TABLE tenant.catalogue_state (
    tenant_id       uuid PRIMARY KEY,
    version         bigint NOT NULL DEFAULT 1
);
-- CCH-02: incremented in the same transaction as any write below that affects public
-- catalogue output. One counter per tenant, read on every cache-key build.

CREATE TABLE tenant.categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    parent_id       uuid REFERENCES tenant.categories(id),
    name            varchar(80) NOT NULL,        -- SEC-06 cap
    slug            text NOT NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    visible         boolean NOT NULL DEFAULT true,
    UNIQUE (tenant_id, slug)
);

CREATE TYPE tenant.delivery_mode AS ENUM ('default', 'adjustable');

CREATE TABLE tenant.products (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    name            varchar(200) NOT NULL,
    slug            text NOT NULL,
    description     text,
    price           numeric(10,2) NOT NULL CHECK (price >= 0),
    delivery_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
    weight_kg       numeric(10,3),                -- null => Adjustable mode unavailable (PRD-16)
    delivery_mode   tenant.delivery_mode NOT NULL DEFAULT 'default',
    active          boolean NOT NULL DEFAULT true,
    -- denormalised for list pages, kept in sync in the same transaction as any variant write (CCH-11):
    min_price       numeric(10,2),
    max_price       numeric(10,2),
    in_stock        boolean NOT NULL DEFAULT true,
    primary_category_id uuid REFERENCES tenant.categories(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX ON tenant.products (tenant_id, primary_category_id, sort_order);

CREATE TABLE tenant.product_categories (          -- PRD-15: multi-category assignment
    product_id      uuid NOT NULL REFERENCES tenant.products(id),
    category_id     uuid NOT NULL REFERENCES tenant.categories(id),
    PRIMARY KEY (product_id, category_id)
);

CREATE TABLE tenant.product_variants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL REFERENCES tenant.products(id),
    attribute_values jsonb NOT NULL DEFAULT '{}', -- {"Size": "L", "Color": "Red"}
    price           numeric(10,2),                -- override, defaults to product.price when null
    delivery_charge numeric(10,2),
    weight_kg       numeric(10,3),
    delivery_mode   tenant.delivery_mode,
    stock           integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
    sku             text,
    UNIQUE (product_id, attribute_values)          -- ATR-06
);
CREATE INDEX ON tenant.product_variants (tenant_id, product_id);
```

### 3.3 Orders

```sql
CREATE TYPE tenant.payment_status AS ENUM
    ('unverified', 'pending_verification', 'partially_paid', 'paid', 'payment_failed', 'refunded');
CREATE TYPE tenant.fulfillment_status AS ENUM
    ('unfulfilled', 'processing', 'partially_shipped', 'shipped', 'partially_delivered', 'delivered', 'returned');

CREATE TABLE tenant.order_counters (               -- DAT-07: gap-free order numbers per tenant
    tenant_id       uuid PRIMARY KEY,
    next_number     bigint NOT NULL DEFAULT 1
);

CREATE TABLE tenant.orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    order_number    text NOT NULL,                 -- ORD-YYYYMMDD-NNNN
    tracking_id     text NOT NULL UNIQUE,           -- 8-char, unambiguous alphabet (ORD-05)
    customer_id     uuid REFERENCES tenant.customers(id),
    customer_name   text NOT NULL,
    customer_phone  varchar(15) NOT NULL,
    location_id     integer NOT NULL,               -- FK by value to control.locations (CUS-08), no cross-schema FK
    address         text NOT NULL,
    payment_status  tenant.payment_status NOT NULL DEFAULT 'unverified',
    fulfillment_status tenant.fulfillment_status NOT NULL DEFAULT 'unfulfilled',
    status_override text,                           -- hold | cancelled | in_review, null otherwise (ORD-41)
    subtotal        numeric(12,2) NOT NULL,
    delivery_charge numeric(10,2) NOT NULL,          -- sum of order_lines.delivery_charge (ORD-06)
    discount        numeric(10,2) NOT NULL DEFAULT 0,
    grand_total     numeric(12,2) NOT NULL,
    due              numeric(12,2) NOT NULL,
    courier_key     text,                            -- set once booked
    courier_zone_code text,                          -- resolved via control.courier_location_map at booking (CUS-12)
    consignment_id  text,
    -- QTA-01/05/07: the ONLY column the handling counters read; order creation never touches it.
    handled_at      timestamptz,
    source          text NOT NULL DEFAULT 'dashboard', -- dashboard | api | storefront
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, order_number)
);
CREATE INDEX ON tenant.orders (tenant_id, created_at DESC);
CREATE INDEX ON tenant.orders (tenant_id, handled_at) WHERE handled_at IS NOT NULL; -- QTA-01/05 counters
CREATE INDEX ON tenant.orders (tenant_id, customer_phone);

CREATE TABLE tenant.order_lines (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    order_id        uuid NOT NULL REFERENCES tenant.orders(id),
    -- ORD-46: advisory only, never required to render the line; nullable so a hard-deleted
    -- product/variant never breaks a past order.
    product_id      uuid,
    variant_id      uuid,
    -- everything below is a snapshot, copied at order time, never read live:
    product_name    text NOT NULL,
    attribute_values jsonb NOT NULL DEFAULT '{}',
    thumbnail_url   text,                            -- best-effort only (ORD-47)
    unit_price      numeric(10,2) NOT NULL,
    quantity        integer NOT NULL CHECK (quantity >= 1),
    item_discount   numeric(10,2) NOT NULL DEFAULT 0,
    weight_kg       numeric(10,3),
    delivery_mode   tenant.delivery_mode NOT NULL,
    delivery_charge numeric(10,2) NOT NULL            -- this line's own computed charge (ORD-06a)
);
CREATE INDEX ON tenant.order_lines (tenant_id, order_id);

CREATE TABLE tenant.order_status_history (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    order_id        uuid NOT NULL,
    field           text NOT NULL,                   -- payment_status | fulfillment_status | status_override
    old_value       text,
    new_value       text NOT NULL,
    note            text,
    changed_by      uuid,
    changed_at      timestamptz NOT NULL DEFAULT now()
);
-- SCL-05: first candidate for monthly partitioning once a tenant's history grows large.

CREATE TABLE tenant.customers (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    phone           varchar(15) NOT NULL,
    name            text,
    order_count     integer NOT NULL DEFAULT 0,
    total_spent     numeric(12,2) NOT NULL DEFAULT 0,
    last_order_at   timestamptz,
    UNIQUE (tenant_id, phone)
);
```

### 3.4 Payments, wallets, couriers, balance

```sql
CREATE TABLE tenant.wallet_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    provider        text NOT NULL,                   -- bkash | nagad | rocket | bank_transfer
    account_name    varchar(100) NOT NULL,
    number          varchar(20),                      -- wallet kind
    bank_details    jsonb,                             -- bank kind (WAL-14)
    active          boolean NOT NULL DEFAULT false,    -- exactly one active per provider (WAL-03), enforced in app logic
    gateway_credentials_encrypted bytea,
    gateway_active  boolean NOT NULL DEFAULT false,
    note            varchar(500)
);
CREATE UNIQUE INDEX ON tenant.wallet_accounts (tenant_id, provider, number)
    WHERE number IS NOT NULL;

CREATE TABLE tenant.payment_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    order_id        uuid REFERENCES tenant.orders(id),
    amount          numeric(12,2) NOT NULL,
    status          text NOT NULL DEFAULT 'created',  -- created|awaiting_payment|checking|verified|needs_review|failed|expired|cancelled
    return_url      text NOT NULL,
    sender_number   text,
    transaction_id  text,
    expires_at      timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON tenant.payment_sessions (transaction_id) WHERE transaction_id IS NOT NULL; -- PAY-16, platform-wide really (see control.used_transaction_ids below)

CREATE TABLE tenant.payments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    order_id        uuid REFERENCES tenant.orders(id),
    session_id      uuid REFERENCES tenant.payment_sessions(id),
    amount          numeric(12,2) NOT NULL,
    method          text NOT NULL,
    sender_number   text,
    transaction_id  text NOT NULL,
    verification_level smallint NOT NULL,             -- 1 manual | 2 listener | 3 gateway
    status          text NOT NULL DEFAULT 'pending_verification',
    verified_by     uuid,
    verified_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Decided 2026-10-02: a plain unique index on tenant.payments/payment_sessions.transaction_id
-- only enforces platform-wide uniqueness while those rows exist. Once a tenant is hard-deleted
-- (LIF-19, day 60), its payment rows are gone and the transaction ID would silently become
-- reusable -- undermining DAT-09's intent for exactly the tenants most likely deleted for cause
-- (fraud). This table is append-only and never touched by tenant deletion (DAT-15 excludes it
-- explicitly), so a transaction ID, once used anywhere on the platform, is unusable forever.
CREATE TABLE control.used_transaction_ids (
    transaction_id  text PRIMARY KEY,
    first_used_at   timestamptz NOT NULL DEFAULT now(),
    tenant_id       uuid NOT NULL             -- the tenant that first used it, kept for audit even after that tenant is deleted; not a foreign key for that reason
);

CREATE TABLE tenant.courier_connections (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    courier_key     text NOT NULL,
    credentials_encrypted bytea NOT NULL,
    is_default      boolean NOT NULL DEFAULT false,
    webhook_secret  text NOT NULL,
    status          text NOT NULL DEFAULT 'active',    -- active | retiring-aware via control's adapter registry
    UNIQUE (tenant_id, courier_key)
);

CREATE TABLE tenant.balance_ledger (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    type            text NOT NULL,                     -- top_up | sms | ai | extraction | fraud_check |
                                                          -- order_fee | product_fee | plan_payment | adjustment | reversal
    amount          numeric(10,2) NOT NULL,             -- signed
    units           numeric(10,2),
    rate_used       numeric(12,4),
    reference       jsonb,
    balance_after   numeric(12,2) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- BAL-02: append-only (insert-only grant, same pattern as audit tables); balance_amount on
-- control.tenants is a cached total, always re-derivable by summing this table.
```

**Note on `transaction_id` uniqueness (PAY-16, BIL-07):** the SRS states this must be unique *platform-wide*, but `tenant.payment_sessions`/`payments` live in per-tenant, RLS-protected tables, so a plain unique index only covers one tenant. At launch (single cell, one schema) a lightweight `control.used_transaction_ids (transaction_id text primary key, first_used_at timestamptz, tenant_id uuid)` table (defined in full in section 2.4), written in the same transaction as the payment/session insert, gives the real platform-wide guarantee without weakening tenant RLS. This is exactly the kind of platform-wide uniqueness registry SCL-06 already anticipates living in the control schema once cells exist.

### 3.5 Keys, audit, misc

```sql
CREATE TABLE tenant.api_keys (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    name            text NOT NULL,
    type            text NOT NULL,                     -- public | secret
    key_hash        text NOT NULL,
    key_prefix      text NOT NULL,
    scopes          text[] NOT NULL DEFAULT '{}',
    allowed_origins text[] NOT NULL DEFAULT '{}',       -- public keys
    ip_allowlist    inet[],                              -- secret keys
    expires_at      timestamptz,
    revoked_at      timestamptz,
    last_used_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON tenant.api_keys (key_hash);

CREATE TABLE tenant.activity_log (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    actor_type      text NOT NULL,                      -- user | api_key | system | platform_support
    actor_id        uuid,
    action          text NOT NULL,
    target_type     text,
    target_id       uuid,
    result          text NOT NULL,
    summary         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- AUD-01..08: insert-only at the role level; SCL-05 partitioning candidate.
```

Database roles: `app_write` (no RLS bypass, used for the write pool), `app_read` (SELECT-only, read-only transactions by default, used for the read pool — DAT-41/DAT-45). Both have the audit/ledger/activity tables as INSERT-only, no UPDATE/DELETE grant at all (DAT-10, BAL-02, AUD-03).

**Retention purge (AUD-06), decided 2026-10-07 (D24).** `tenant.activity_log`'s insert-only trigger rejects UPDATE and DELETE from every role unconditionally — the app never holds a credential that could remove a row, full stop. Deleting entries past a plan's retention therefore cannot run through the app at all. It runs as its own privileged pipeline step, `packages/db/src/purge-activity-log.ts` (`pnpm --filter @lytronix/db purge:activity-log`), using the same schema-owner connection as migrations, never the app's. Inside one transaction it disables the trigger, deletes the expired rows across every shop (joining each shop's plan for its `activity_retention_days`, 30 by default), and re-enables the trigger before committing — so a crash mid-run rolls back the disable too, and the guarantee holds for every connection except this one deliberate, auditable step. Run it on a schedule (cron, a systemd timer, or the ops platform's own scheduler), same category as a migration, never bundled into the server's own startup or request handling.

---

## 4. Plans depth: add-ons, pay-as-you-go, not-for-sale

```sql
-- PLN-10/17/18: not-for-sale plans are ordinary rows in control.plans with for_sale = false,
-- filtered server-side in every tenant-facing query; this table just records why/how one was assigned.
CREATE TABLE control.plan_assignments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    plan_id         uuid NOT NULL REFERENCES control.plans(id),
    expiry          timestamptz,                  -- null = no expiry (PLN-18)
    reason          text NOT NULL,
    assigned_by     uuid NOT NULL,                -- operator account id
    assigned_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.addons (                      -- PLN-13
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key             text NOT NULL UNIQUE,           -- extra_orders | extra_products | extra_seat | extra_storage | extra_bandwidth | extra_requests
    unit_size       numeric(12,2) NOT NULL,
    price           numeric(10,2) NOT NULL,
    retired_at      timestamptz
);

CREATE TABLE control.addon_purchases (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    addon_id        uuid NOT NULL REFERENCES control.addons(id),
    quantity        integer NOT NULL DEFAULT 1,
    purchased_at    timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL            -- PLN-14: lapses at the end of the current period
);

-- DWN/UPG/LIF (downgrade, upgrade, lifecycle) need no new tables: they're operations that
-- read/write control.tenants.state, .plan_snapshot, .period_start/end and write a
-- control.platform_audit_log row (LIF-25, DWN-17). A scheduled downgrade is one extra row:
CREATE TABLE control.scheduled_plan_changes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL UNIQUE REFERENCES control.tenants(id), -- one pending change at a time (UPG-08 pattern)
    kind            text NOT NULL,                  -- downgrade | pay_as_you_go_switch
    target_plan_id  uuid REFERENCES control.plans(id),
    effective_at    timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Pay-as-you-go (PYG):** no new tables. A pay-as-you-go tenant is `control.tenants` with `plan_id NULL`, `state = 'pay_as_you_go'`, `period_start/end NULL`. Its order fee and product fee are ordinary `tenant.balance_ledger` rows (`type = 'order_fee' | 'product_fee'`), charged at the moment `tenant.orders.handled_at` is set (PYG-02) or at product creation (PYG-16) — the same ledger every other charge uses.

## 5. SMS, push and notifications

```sql
CREATE TABLE tenant.sms_settings (
    tenant_id       uuid PRIMARY KEY,
    events          jsonb NOT NULL DEFAULT '{}',    -- {"order_placed": true, "order_delivered": false, ...} (SMS-01/02/03)
    templates       jsonb NOT NULL DEFAULT '{}',    -- {"order_placed": "{{shop_name}}: your order..."} (SMS-10)
    sender_id       text,
    monthly_spend_cap numeric(10,2)
);

CREATE TABLE tenant.sms_log (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    order_id        uuid,
    event_key       text NOT NULL,
    to_phone        varchar(15) NOT NULL,
    body_length     integer NOT NULL,
    units           integer NOT NULL,               -- SMS-09: ceil(length / unit_size)
    cost            numeric(10,2) NOT NULL,
    is_essential    boolean NOT NULL,
    status          text NOT NULL DEFAULT 'sent',    -- sent | delivered | failed | blocked
    blocked_reason  text,
    provider_message_id text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.sms_log (tenant_id, created_at DESC);
-- SCL-05 partitioning candidate, same as order_status_history.

CREATE TABLE tenant.push_subscriptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    endpoint        text NOT NULL,
    keys            jsonb NOT NULL,                  -- Web Push p256dh/auth
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, endpoint)
);

CREATE TABLE tenant.notifications (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    user_id         uuid,                            -- null = visible to anyone with the matching permission
    type            text NOT NULL,                    -- new_order | payment_to_verify | low_balance | limit_warning | ...
    payload         jsonb NOT NULL DEFAULT '{}',
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.notifications (tenant_id, user_id, read_at);
```

## 6. Chat and AI

```sql
CREATE TABLE tenant.chat_threads (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    shopper_id      uuid,                            -- nullable: anonymous visitor
    visitor_id      text,                             -- CHT-01: public-key + visitor id for anonymous chat
    channel         text NOT NULL DEFAULT 'web',       -- web | messenger
    status          text NOT NULL DEFAULT 'open',       -- open | needs_human | closed
    ai_paused_until timestamptz,                        -- AI-06: staff reply pauses AI for 30 min
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.chat_threads (tenant_id, created_at DESC);

CREATE TABLE tenant.chat_messages (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    thread_id       uuid NOT NULL REFERENCES tenant.chat_threads(id),
    sender_type     text NOT NULL,                     -- shopper | staff | ai
    sender_id       uuid,
    body            varchar(2000),
    media_url       text,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.chat_messages (tenant_id, thread_id, created_at);
-- CHT-05: a scheduled job trims messages/media past the plan's retention, keeping each
-- thread's first message; no schema change needed for that, just a WHERE on created_at.

CREATE TABLE tenant.ai_settings (
    tenant_id       uuid PRIMARY KEY,
    enabled         boolean NOT NULL DEFAULT false,
    instructions    varchar(2000),
    shop_info       text,
    monthly_spend_cap numeric(10,2)
);
```

## 7. Fraud checking

```sql
CREATE TABLE tenant.fraud_checks (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    phone           varchar(15) NOT NULL,
    order_id        uuid,
    level           text,                              -- low | medium | high | unknown
    summary         jsonb,                              -- {delivered, cancelled, returned}
    sources         text[] NOT NULL DEFAULT '{}',
    cached          boolean NOT NULL DEFAULT false,
    checked_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.fraud_checks (tenant_id, phone, checked_at DESC);

CREATE TABLE tenant.fraud_rules (
    tenant_id       uuid PRIMARY KEY,
    auto_check_cod_above numeric(10,2),                -- FRD-05
    contribute_to_shared_data boolean NOT NULL DEFAULT true -- FRD-10
);

-- Platform-wide, salted, never rotated (FRD-09). Confirmed 2026-10-02 to live in `control`
-- alongside every other platform-wide table; flagged for whenever cells (SCL-10) are adopted
-- (likely years out, measurement-triggered per OD-51, not a launch concern): this specific
-- table must remain one genuinely global table or service reachable by every cell, never
-- partitioned or replicated per-cell, since the shared fraud signal only works if every
-- cell can see every other cell's contributions. control.notices carries no such constraint.
CREATE TABLE control.fraud_hashes (
    phone_hash      text PRIMARY KEY,
    delivered_count integer NOT NULL DEFAULT 0,
    cancelled_count integer NOT NULL DEFAULT 0,
    returned_count  integer NOT NULL DEFAULT 0,
    contributing_tenants integer NOT NULL DEFAULT 0,    -- FRD-13: signal hidden below 5
    updated_at      timestamptz NOT NULL DEFAULT now()
);
```

## 8. SMS listener app

```sql
CREATE TABLE tenant.listener_pairing_codes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    code_hash       text NOT NULL,
    expires_at      timestamptz NOT NULL,
    used_at         timestamptz
);

CREATE TABLE tenant.listener_devices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    name            text,
    model           text,
    app_version     text,
    token_hash      text NOT NULL UNIQUE,               -- LSN-11: hash only, 32+ random bytes
    installation_id text NOT NULL,
    status          text NOT NULL DEFAULT 'active',       -- active | revoked
    flag_count      integer NOT NULL DEFAULT 0,           -- LSN-12
    last_seen_at    timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.listener_devices (tenant_id, status);

CREATE TABLE tenant.listener_messages (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    device_id       uuid NOT NULL REFERENCES tenant.listener_devices(id),
    raw_text        text,                                -- redacted to null after 90 days (LSN-17)
    transaction_id  text,
    amount          numeric(10,2),
    sender_number   text,
    status          text NOT NULL,                        -- matched | unmatched | ignored | duplicate
    matched_payment_id uuid,
    received_at     timestamptz NOT NULL
);
CREATE INDEX ON tenant.listener_messages (tenant_id, transaction_id);
```

## 9. Tenant-configured outbound webhooks

```sql
CREATE TABLE tenant.webhook_endpoints (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    url             text NOT NULL,
    events          text[] NOT NULL,                     -- order.created, payment.verified, ...
    secret          text NOT NULL,
    consecutive_failures integer NOT NULL DEFAULT 0,
    disabled_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CHECK (array_length((SELECT array_agg(id) FROM tenant.webhook_endpoints w2 WHERE w2.tenant_id = tenant.webhook_endpoints.tenant_id), 1) <= 5); -- API-12, enforced in application code in practice

CREATE TABLE tenant.webhook_deliveries (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    endpoint_id     uuid NOT NULL REFERENCES tenant.webhook_endpoints(id),
    event_type      text NOT NULL,
    payload         jsonb NOT NULL,
    attempt         integer NOT NULL DEFAULT 1,
    status_code     integer,
    response_snippet text,
    delivered_at    timestamptz
);
CREATE INDEX ON tenant.webhook_deliveries (tenant_id, endpoint_id, delivered_at DESC);
```

## 10. Notice board (platform-wide, control schema)

```sql
CREATE TABLE control.notices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title           varchar(120) NOT NULL,
    body_bn         varchar(5000) NOT NULL,
    body_en         varchar(5000) NOT NULL,
    category        text NOT NULL,                        -- rate_change | maintenance | new_feature | policy | security | general
    severity        text NOT NULL,                          -- info | important | urgent
    audience        jsonb NOT NULL,                          -- {"all": true} | {"plans": [...]} | {"states": [...]} | {"tenantId": "..."}
    publish_at      timestamptz NOT NULL,
    end_at          timestamptz,
    pinned          boolean NOT NULL DEFAULT false,
    requires_ack    boolean NOT NULL DEFAULT false,
    withdrawn_at    timestamptz,
    created_by      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.notice_reads (
    notice_id       uuid NOT NULL REFERENCES control.notices(id),
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    read_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (notice_id, user_id)
);

CREATE TABLE control.notice_acknowledgments (
    notice_id       uuid NOT NULL REFERENCES control.notices(id),
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    acknowledged_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (notice_id, tenant_id)                       -- one ack per tenant (the owner acks on its behalf, NTC-05)
);
```

## 11. Operator console and support

```sql
CREATE TABLE control.operator_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text NOT NULL UNIQUE,
    password_hash   text NOT NULL,
    two_factor_secret text,                       -- set at enrollment; NULL until the QR/secret is issued
    two_factor_confirmed_at timestamptz,           -- ADM-01: NULL means enrollment incomplete and the
                                                    -- account cannot sign in past that step, mandatory,
                                                    -- not a togglable "enabled" flag
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.operator_backup_codes (        -- ADM-01, ADM-18
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id     uuid NOT NULL REFERENCES control.operator_accounts(id),
    code_hash       text NOT NULL,                  -- hashed, same discipline as password_hash
    used_at         timestamptz                     -- NULL = still valid; set once on use, never reused
);

CREATE TABLE control.manual_payment_entries (             -- ADM-14/15
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    kind            text NOT NULL,                          -- plan_purchase | renewal | upgrade | top_up
    amount          numeric(10,2) NOT NULL,
    wallet          text NOT NULL,
    transaction_id  text NOT NULL UNIQUE,
    sender_number   text,
    payment_time    timestamptz NOT NULL,
    evidence_url    text NOT NULL,
    reason          text NOT NULL,
    entered_by      uuid NOT NULL,
    reversed_by_entry_id uuid REFERENCES control.manual_payment_entries(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.payment_report_queue (                -- ADM-06/ADM-17: "I have paid" claims + review queue
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    kind            text NOT NULL,                           -- plan_payment | top_up | tenant_claim
    payload         jsonb NOT NULL,
    status          text NOT NULL DEFAULT 'pending',           -- pending | approved | rejected
    reviewed_by     uuid,
    reviewed_at     timestamptz
);

CREATE TABLE control.page_reports (                         -- TVR-02/ADM-12: "Report this page"
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    session_id      uuid,
    reason          text,
    reporter_ip     inet,
    status          text NOT NULL DEFAULT 'open',              -- open | suspended | dismissed
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.support_tickets (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    subject         text NOT NULL,
    status          text NOT NULL DEFAULT 'open',
    context         jsonb,                                     -- plan, state, recent errors, attached automatically
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.support_ticket_messages (
    id              bigserial PRIMARY KEY,
    ticket_id       uuid NOT NULL REFERENCES control.support_tickets(id),
    sender_type     text NOT NULL,                             -- tenant | operator
    body            text NOT NULL,
    image_urls      text[],
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

## 12. Observability (mostly external; the one table that matters here)

```sql
CREATE TABLE control.job_heartbeats (                        -- MON-04/OBS-02
    job_name        text PRIMARY KEY,
    last_run_at     timestamptz,
    last_status     text,
    server_id       text
);
```

Metrics, error tracking, log shipping and uptime checks (MON/OBS sections) are external services (Sentry, Grafana Cloud, UptimeRobot per OD-43), not schema — nothing else to design here.

## 13. What's still an application concern, not a schema one

- Cell-aware connection routing (SCL-07's column exists now; the routing logic that reads it is code).
- Rate-limit enforcement and the catalogue micro-cache (RED/CCH) — in-process/Redis, not tables.
- The job queue itself (SCL-08: one PostgreSQL-backed interface), **decided 2026-10-07 (D25): pg-boss**, not a hand-rolled `control.jobs` table. pg-boss manages its own schema and tables; this codebase reaches it only through its own queue interface (per SCL-08), never pg-boss's API directly from a caller, so the library stays swappable. Not spelled out further here since it doesn't affect any other table's design. Replaces the hand-rolled `SmsOutbox` table and `SmsWorker` (`packages/db`/`apps/server`, messaging; not otherwise documented in this file); email's outbox is built on the same library from the start.

## 14. Open questions — resolved 2026-10-02

1. **Weight precision**: confirmed — `numeric(10,3)` stays as is; its range comfortably covers anything heavier than small electronics with room to spare.
2. **Partitioning timing**: decided — `order_status_history`, `sms_log`, `activity_log`, `platform_audit_log` and `webhook_deliveries` stay plain tables at launch; partitioning is added when SCL's measurement-based triggers call for it (OD-51), not preemptively.
3. **`control.used_transaction_ids`**: adopted — see the table definition in section 2.4, and `DAT-09`/`DAT-15` for why it must outlive tenant deletion.
4. **`control.fraud_hashes` / `control.notices` placement**: confirmed — both stay in `control`; `fraud_hashes` is now flagged inline (section 7) to remain one genuinely global table whenever cells are eventually adopted.

## 15. Tenant identity verification (KYC, SRS 19.5)

Lives in `control` so it can be queried by subscriber and by operator, but it is tenant data for deletion purposes: the day-60 job (LIF-19, DAT-15) deletes every row where `tenant_id` matches, and deletes the R2 objects at `front_object_key` and `back_object_key`. The subscriber keeps no KYC record after deletion (KYC-10). Images are stored outside Postgres in a dedicated private R2 bucket, separate from tenant media (KYC-05). Only the object key is kept here. Serving is by signed URL to the owner and to operators with `kyc:review` (KYC-06), and is not metered (KYC-13): the bucket is not under any tenant prefix, so it is excluded from the per-object storage rows and reconciliation (MED-04) and from the tenant media Worker's bandwidth counts (BND-01).

```sql
CREATE TABLE control.identity_verifications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriber_id       uuid NOT NULL REFERENCES control.subscribers(id),
    tenant_id           uuid NOT NULL REFERENCES control.tenants(id),
    status              text NOT NULL,              -- requested | submitted | pending_review | verified | rejected (KYC-08)
    trigger             text NOT NULL,              -- operator | handled_orders | balance_top_up (KYC-01)
    requested_by        uuid,                       -- operator account id; null when automatic
    requested_at        timestamptz NOT NULL DEFAULT now(),
    nid_number_enc      bytea,                      -- KYC-05: encrypted, key outside the database
    nid_number_last4    text,                       -- for masked display (KYC-09)
    dob_enc             bytea,                      -- KYC-05
    front_object_key    text,                       -- private R2 key, never a public URL
    back_object_key     text,
    photo_object_key    text,                       -- owner's face photo (KYC-03), same bucket and rules as the NID images
    consent_version     text NOT NULL,              -- KYC-03
    consent_at          timestamptz NOT NULL,
    reviewed_by         uuid,                       -- KYC-07
    reviewed_at         timestamptz,
    rejection_reason    text,
    submitted_at        timestamptz
);

-- one open request at a time per tenant (KYC-01); past attempts remain as history (KYC-08)
CREATE UNIQUE INDEX identity_verifications_one_open
    ON control.identity_verifications (tenant_id)
    WHERE status IN ('requested', 'submitted', 'pending_review');
```

**Notes**

- `control.subscribers` and `control.tenants` are the existing tables from section 2; the foreign keys assume those names.
- `nid_number_last4` exists so lists and the dashboard never need to decrypt (KYC-09).
- Reveals of the full number and image views write to `control.platform_audit_log`, not to this table (KYC-12). The audit log keeps that a reveal happened, never the values (KYC-11), so it survives deletion as DAT-15 requires.
- Deletion order: delete the R2 image objects first, then the row. If the row is deleted first and an object delete fails, the object is orphaned with no row left to find it. If the job stops after the objects are gone, a retry finds the objects already missing and simply removes the row. The job is idempotent and retries until both are gone.
- Upload path (KYC-15): the owner uploads each image to a temporary prefix in the KYC bucket through a signed URL. On a validated submission the object moves to its permanent key, which is what `front_object_key` and `back_object_key` record. Failed or abandoned temporary objects are deleted by a job after [24] hours.
- No backup of the KYC bucket (KYC-14). A lost or unreadable image is recovered by an operator requesting a re-upload, which starts a new submission row, so earlier submissions stay in history.

## Migration index (slices 5 to 7)

Migrations are named by number and purpose. Drizzle tracks what has run by content hash and timestamp, so a rename never changes what has been applied. Keep the number order.

| File | Slice | Purpose |
| --- | --- | --- |
| `0005_signin_foundation` | 5 | Renames the challenge purpose to kind; makes the session tenant nullable; adds must_set_password and the lockout columns |
| `0006_session_sign_in_method` | 5 | Records how each session was opened |
| `0007_sign_in_failures` | 5 | Adds the failed sign-in table for the sliding-window lock; drops the per-account lock columns |
| `0008_identity_kind_google` | 6 | Adds the google identity kind |
| `0009_challenge_destination` | 6 | Renames the challenge phone to destination |
| `0010_challenge_channel` | 6 | Adds the sms or email channel to challenges |
| `0011_staff_owner_email` | 6 | Owner staff row: phone becomes nullable; adds email, unique per shop |
| `0012_oauth_states` | 6 | Adds the Google and Facebook sign-in state table |
| `0013_oauth_state_attach` | 6 | Lets a state attach a provider to a signed-in account |
| `0014_starter_staff_seats` | 7 | Sets Starter's `staff` plan limit to 2, counting the owner (D21) |
| `0015_staff_subscriber_link` | 7 | Adds `tenant.users.subscriber_id`, unique platform-wide (STF-06, D22) |
| `0016_identity_pending_verification` | 7 | Makes `subscriber_identities.verified_at` optional, for a staff phone pending its first code sign-in |
| `0017_staff_must_set_password` | 7 | Adds `tenant.users.must_set_password`, forcing a change after an owner reset (STF-13) |
