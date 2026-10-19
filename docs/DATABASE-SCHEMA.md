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
| Canonical location list + courier areas, decoupled (CUS-08, CUS-10 to CUS-13) | `control.locations` and `control.courier_areas`, both platform-wide |
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
    terms_version   text NOT NULL,       -- LEG-01: the terms of service accepted at sign-up
    privacy_version text NOT NULL,       -- LEG-01: the privacy policy accepted at sign-up
    created_at      timestamptz NOT NULL DEFAULT now(),  -- also the time of acceptance (LEG-01)
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
    -- TEN-15 / OD-53: a tenant is created from exactly one identity; the partial unique index
    -- tenants_owner_identity_live_idx (below) enforces "at most one live tenant per identity" at the
    -- database. A deleted tenant doesn't count, so its owner can open a new shop on the same identity (LIF-21).
    owner_identity_id   uuid NOT NULL REFERENCES control.subscriber_identities(id),
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
    -- D2-11 (added 2026-10-13): cached, updated whenever an order-fee, product-fee or top-up
    -- ledger entry is written (the same denormalized pattern as balance_amount above). Read by
    -- the pay-as-you-go inactivity job (PYG-21) instead of scanning tenant.balance_ledger on
    -- every run. Null for a tenant that was never pay-as-you-go.
    last_activity_at      timestamptz,
    -- LIF-01: the owner's own intent to not renew, set/cleared by POST billing/cancel and
    -- .../cancel/undo. The state machine never reads this (LIF-02 already reaches `grace` at
    -- period end regardless) -- it exists only so the dashboard can show "cancelled, effective
    -- <date>" and offer "Undo". Added by migration 0031_lifecycle_cancellation.sql.
    cancelled_at           timestamptz,
    -- PYG-09, PYG-21: when the tenant entered `archived`; cleared when a plan or pay-as-you-go restores
    -- it. A pay-as-you-go shop's deletion clock (LIF-18, LIF-19) runs from here, since it has no period
    -- end. Added by migration 0047_tenant_archived_at.sql.
    archived_at            timestamptz,
    -- LIF-20/21/22: set once by the day-60 deletion job (LIF-19), never before. The row and its
    -- state ('deleted') persist after this is set -- deletion removes only the business data
    -- listed in LIF-19, not the tenant row itself (LIF-20 keeps the subscriber link, plan/payment
    -- history, balance and invoices reachable). Anchors the 30-day subdomain-reservation window
    -- (LIF-21) and the 30-day backup-retention window (LIF-22).
    deleted_at            timestamptz,
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
    description     text,                       -- PLN-01
    rank            integer NOT NULL,           -- PLN-16: unique among for-sale plans
    for_sale        boolean NOT NULL DEFAULT true, -- PLN-10: not-for-sale plans never returned to tenants
    version         integer NOT NULL DEFAULT 1,
    limits          jsonb NOT NULL,             -- seats, products, storage, bandwidth, order-handling, etc (2.1)
                                                 -- `staff` counts the owner: Trial 1 (owner only), Starter 2 (D21);
                                                 -- a plan with no `staff` key gets 1 seat
    features        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON control.plans (rank) WHERE for_sale = true; -- PLN-16

CREATE TABLE control.billing_terms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label_bn        text NOT NULL,              -- TRM-01
    label_en        text NOT NULL,
    months          integer NOT NULL CHECK (months BETWEEN 1 AND 60),
    visible         boolean NOT NULL DEFAULT true,
    display_order   integer NOT NULL DEFAULT 0, -- TRM-01
    default_discount_pct numeric(5,2),
    -- TRM-14: null = platform-wide (the normal case); set = visible to exactly one tenant,
    -- enforced by filtering on this column wherever terms are listed for purchase.
    tenant_id       uuid REFERENCES control.tenants(id),
    retired_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
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
                                                  -- 'payg_product_fee' (10 TK, OD-48), 'sms_unit_size_chars' (RAT-13)
    value           numeric(12,4) NOT NULL,
    effective_from  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE control.rate_history (
    id              bigserial PRIMARY KEY,
    key             text NOT NULL,
    old_value       numeric(12,4),
    new_value       numeric(12,4) NOT NULL,
    changed_by      uuid,                        -- operator account id
    -- RAT-09: null = no notice was published for this change. Deliberately NOT a foreign key
    -- (decided 2026-10-13): control.notices (section 10) is Phase 1-deferred NTC scope and
    -- doesn't exist in code yet when this slice ships; a plain uuid, unconstrained until it does.
    notice_id       uuid,
    changed_at      timestamptz NOT NULL DEFAULT now()
);
-- RAT-01..14: a charge always reads control.rates at the moment it's recorded; rate_history
-- is append-only and never consulted for billing, only for the "current rates" / audit screen.
-- RAT-09's notice_id is set after the fact if the operator publishes the prefilled notice.

-- RAT-14: unlike every other rate above, this one is per-tenant, not platform-wide, so it
-- cannot live in control.rates. One row per tenant that has ever set it; a tenant with no row
-- uses the default of 0.
CREATE TABLE tenant.shop_settings (
    tenant_id                       uuid PRIMARY KEY,
    extra_delivery_charge_per_kg    numeric(10,2) NOT NULL DEFAULT 0,
    default_payment_policy          tenant.payment_policy NOT NULL DEFAULT 'none',  -- PRD-08 shop default
    default_advance_amount          numeric(10,2) CHECK (default_advance_amount >= 0)
);
```

### 2.4 Invoices and platform audit

```sql
CREATE TABLE control.invoices (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    number          bigint NOT NULL UNIQUE,      -- gap-free, from a locked counter row, not a sequence (DAT-07)
    kind            text NOT NULL, -- purchase | renewal | upgrade (BIL-12) -- no default: every insert supplies it explicitly
    plan_snapshot   jsonb NOT NULL,
    amount          numeric(10,2) NOT NULL,
    credit_amount   numeric(10,2) NOT NULL DEFAULT 0, -- UPG-03/UPG-15: the credit line shown on an upgrade invoice
    billing_term_label text NOT NULL,
    -- BIL-12: copied at issue, so a later rename or plan edit never changes an issued invoice. Null on
    -- invoices issued before migration 0045.
    shop_name       text,
    owner_name      text,
    plan_name       text,
    plan_version    integer,
    period_start    timestamptz,
    period_end      timestamptz,
    discount_amount numeric(10,2) NOT NULL DEFAULT 0, -- saving against the shortest visible term (TRM-12)
    payment_method  text,                        -- balance | wallet
    payment_reference text,                      -- the wallet transaction ID; null for a balance payment
    issued_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE control.invoice_counters (
    id  smallint PRIMARY KEY DEFAULT 1,
    next_number bigint NOT NULL -- no column default (drizzle-kit can't serialize a bigint default);
                                -- the single seed row (id=1, next_number=1) is inserted by hand-written
                                -- SQL in the migration itself, not defaulted per-insert
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
CREATE TABLE control.divisions (                    -- CUS-08: the 8 divisions
    code            text PRIMARY KEY,               -- 'dhaka', 'chattogram', ...
    name_en         text NOT NULL,
    name_bn         text NOT NULL
);

CREATE TABLE control.cities (                       -- CUS-08: one per city corporation; Dhaka North and South
    code            text PRIMARY KEY,               -- together form 'dhaka' ("Dhaka city"), so 11 rows
    name_en         text NOT NULL,
    name_bn         text NOT NULL
);

CREATE TABLE control.locations (
    id              serial PRIMARY KEY,
    zilla           text NOT NULL,
    thana           text NOT NULL,
    division_code   text NOT NULL REFERENCES control.divisions(code),  -- the zilla's division
    city_code       text REFERENCES control.cities(code),              -- null = outside every city area
    UNIQUE (zilla, thana)
);
-- CUS-08: one platform-wide list, seeded once from the standard 64-district dataset,
-- identical for every tenant regardless of which couriers it has connected. A thana belongs to at most one
-- city. Adding a thana or changing its city is a platform data change, announced on the notice board (DLV-02).

CREATE TABLE control.courier_areas (
    id              serial PRIMARY KEY,
    courier_key     text NOT NULL,               -- 'pathao', 'redx', ...; none for a courier that books by address text
    area_code       text NOT NULL,               -- the courier's own ID for the area
    name            text NOT NULL,
    location_id     integer NOT NULL REFERENCES control.locations(id),  -- the one canonical thana it sits in
    retired_at      timestamptz,                 -- no longer offered; still readable on orders that hold it
    UNIQUE (courier_key, area_code)
);
CREATE INDEX ON control.courier_areas (courier_key, location_id) WHERE retired_at IS NULL;
-- CUS-10 to CUS-13: a thana may hold many areas of one courier. Delivery zones and charges never read this
-- table; it only gives a courier its exact area, chosen on the order form or by staff before booking.
-- Adding a courier only adds rows here, never touches control.locations or any tenant address.
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
-- TEN-31, AUTH-31 (migration 0049): besides tenant_isolation, a SELECT-only policy `own_staff_row` lets a
-- transaction that names a person (set_config('app.subscriber_id', ...)) read that person's own staff row in any
-- shop, so the dashboard can list the shops they belong to and staff can sign in with no shop host. Nothing else
-- becomes readable, and every write still follows tenant_isolation.

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

### 3.2 Catalogue, inventory and purchasing

**Revised 2026-10-17.** Replaces the earlier draft (a `jsonb` `attribute_values` column and an integer
`stock` column on the variant). Attributes are normalized rows (ATL), stock lives in an append-only
ledger with levels, reservations, batches and serials (INV), stock enters through purchasing (PUR), and
quantities follow the product's unit (UOM). Every table carries `tenant_id` and the §3 RLS policy unless
noted; same-tenant references use composite `(tenant_id, id)` keys, the pattern §3.1 already uses.

#### Catalogue

**Built in Phase 3 Slice 1 (migration 0051, 2026-10-19)**, with the decisions noted inline below. Columns a
later slice needs arrive with it: `image_id`, `video_id` and `tenant.product_images` (Slice 6), `avg_cost`,
`pack_amount`, `is_stock_holder` and `shared_stock` (Slice 2), `kind` (Phase 4, CMB) and `item_condition` (Slice 9).
**Slice 1b (migration 0052, 2026-10-19)** added `categories.behaves_like` (PST-06), `attribute_options.swatch_color`
(ATR-18), `tenant.size_charts` and `tenant.option_sets` (below) and `business_type_presets.up_front_fields` (PST-05);
`swatch_image_id` and the size chart's `image_id` arrive with media in Slice 6.

```sql
CREATE TABLE tenant.catalogue_state (
    tenant_id       uuid PRIMARY KEY,
    version         bigint NOT NULL DEFAULT 1
);
-- CCH-02/INV-19: incremented in the same transaction as any write that changes public catalogue
-- output, including a stock-state change (in/low/out). Read on every cache-key build.

CREATE TABLE tenant.categories (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    parent_id       uuid,
    name            varchar(80) NOT NULL,
    slug            text NOT NULL,
    image_id        uuid,                         -- tenant.media (MED); optional banner/image
    depth           smallint NOT NULL CHECK (depth BETWEEN 1 AND 4),   -- PRD-03
    behaves_like    text,                         -- PST-06: a control.business_type_presets key; null => nearest
                                                  -- ancestor's, and with none the shop's own type
    sort_order      integer NOT NULL DEFAULT 0,
    visible         boolean NOT NULL DEFAULT true,
    UNIQUE (tenant_id, slug),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, parent_id) REFERENCES tenant.categories(tenant_id, id)
);
-- "Uncategorized" (PRD-03) is a virtual bucket: products with no category, not a row.
-- Decided in Slice 1: a category is deleted outright, not archived. Deleting one with sub-categories or products
-- is refused with their count, unless the products are moved to Uncategorized first.

CREATE TYPE tenant.delivery_mode   AS ENUM ('default', 'adjustable');
CREATE TYPE tenant.stock_unit      AS ENUM ('piece', 'kg', 'g', 'liter', 'ml', 'dozen', 'pack', 'box'); -- UOM-01
CREATE TYPE tenant.stock_tracking  AS ENUM ('tracked', 'not_tracked');                               -- INV-02
CREATE TYPE tenant.stock_state     AS ENUM ('in', 'low', 'out');                                     -- CCH-08
CREATE TYPE tenant.payment_policy  AS ENUM ('none', 'delivery_charge_only', 'partial_advance', 'full_prepayment');  -- PRD-08
CREATE TYPE tenant.product_kind    AS ENUM ('standard', 'combo');                                     -- CMB-01 (Phase 4)

CREATE TABLE tenant.products (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL,
    name                varchar(200) NOT NULL,
    slug                text NOT NULL,
    kind                tenant.product_kind NOT NULL DEFAULT 'standard',  -- CMB-01: a combo holds no stock
    description         text,
    base_price          numeric(10,2) NOT NULL CHECK (base_price >= 0),
    stock_unit          tenant.stock_unit NOT NULL DEFAULT 'piece',
    stock_tracking      tenant.stock_tracking NOT NULL DEFAULT 'tracked',
    batch_tracked       boolean NOT NULL DEFAULT false,     -- INV-12
    serial_tracked      boolean NOT NULL DEFAULT false,     -- INV-14
    shared_stock        boolean NOT NULL DEFAULT false,     -- INV-24: variants draw from one stock
    low_stock_threshold numeric(14,3) NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),  -- INV-08
    delivery_charge     numeric(10,2) CHECK (delivery_charge >= 0),  -- DLV-03 override; null => zone charge
    weight_kg           numeric(10,3),                     -- null => Adjustable unavailable (PRD-16)
    delivery_mode       tenant.delivery_mode NOT NULL DEFAULT 'default',
    payment_policy      tenant.payment_policy,             -- null => shop_settings.default_payment_policy
    advance_amount      numeric(10,2) CHECK (advance_amount >= 0),   -- partial_advance only
    item_condition      text NOT NULL DEFAULT 'new' CHECK (item_condition IN ('new', 'refurbished', 'used')),  -- FED-02
    video_id            uuid,                              -- one video (PRD-11)
    primary_category_id uuid,
    active              boolean NOT NULL DEFAULT true,
    sort_order          integer NOT NULL DEFAULT 0,
    -- denormalised for list pages, kept in sync in the same transaction as any variant/stock write (CCH-11):
    min_price           numeric(10,2),
    max_price           numeric(10,2),
    stock_state         tenant.stock_state NOT NULL DEFAULT 'out',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,                       -- PRD-13 soft delete
    UNIQUE (tenant_id, slug),
    UNIQUE (tenant_id, id),
    CHECK (NOT (stock_tracking = 'not_tracked' AND (batch_tracked OR serial_tracked))),
    CHECK (NOT (batch_tracked AND serial_tracked)),
    CHECK (NOT (shared_stock AND serial_tracked)),            -- INV-24
    FOREIGN KEY (tenant_id, primary_category_id) REFERENCES tenant.categories(tenant_id, id)
);
CREATE INDEX ON tenant.products (tenant_id, primary_category_id, sort_order) WHERE deleted_at IS NULL;
-- CCH-12 / DAT-13: full-text and trigram search indexes on name/description.

CREATE TABLE tenant.product_categories (            -- PRD-15; the primary one is products.primary_category_id
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    category_id     uuid NOT NULL,
    PRIMARY KEY (tenant_id, product_id, category_id),
    FOREIGN KEY (tenant_id, product_id)  REFERENCES tenant.products(tenant_id, id),
    FOREIGN KEY (tenant_id, category_id) REFERENCES tenant.categories(tenant_id, id)
);

CREATE TABLE tenant.product_images (                -- PRD-11 ordering of images on a product
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    media_id        uuid NOT NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, product_id, media_id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products(tenant_id, id)
);

CREATE TABLE tenant.product_variants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    combination_key text NOT NULL DEFAULT '',     -- ATL-04: sorted "attr=option" pairs; '' = default variant
    sku             text,
    barcode         text,
    price           numeric(10,2) CHECK (price >= 0),   -- override; null => products.base_price
    weight_kg       numeric(10,3),                -- ATR-13 overrides; null => product's value
    delivery_charge numeric(10,2),
    delivery_mode   tenant.delivery_mode,
    image_id        uuid,
    avg_cost        numeric(12,4),                -- INV-10; never in a public response; null = unknown
    pack_amount     numeric(14,3) CHECK (pack_amount > 0),  -- INV-24: shared-stock units per unit sold
    is_stock_holder boolean NOT NULL DEFAULT false,         -- INV-24: the hidden variant holding a shared stock
    active          boolean NOT NULL DEFAULT true,
    deleted_at      timestamptz,
    UNIQUE (tenant_id, id),
    UNIQUE (product_id, combination_key),         -- ATR-06 / ATL-04, a real constraint
    FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products(tenant_id, id)
);
CREATE UNIQUE INDEX ON tenant.product_variants (tenant_id, sku) WHERE sku IS NOT NULL AND deleted_at IS NULL;
-- INV-24: a product with shared_stock has one extra variant with is_stock_holder = true (combination_key
-- '#stock'). Only it has a stock_levels row, batches and movements; it is never sold, never public and not
-- counted by ATR-14. Every sellable variant has pack_amount, and reserving or moving N of it reserves or
-- moves N x pack_amount on the holder inside InventoryLedger.apply().
-- ATR-14 / ATL-03: a trigger refuses the 101st variant of one product.
```

#### Attributes (ATL)

```sql
CREATE TYPE tenant.attribute_data_type AS ENUM ('enum_single', 'enum_multi', 'number_with_unit', 'text', 'boolean');
CREATE TYPE tenant.unit_kind           AS ENUM ('weight', 'volume', 'count');   -- UOM-02
CREATE TYPE tenant.attribute_role      AS ENUM ('variant_defining', 'informational', 'captured_at_order');

CREATE TABLE tenant.attributes (                    -- ATL-01: one table, two scopes
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid,                         -- NULL = platform library row
    name            varchar(80) NOT NULL,
    data_type       tenant.attribute_data_type NOT NULL,
    unit_kind       tenant.unit_kind,             -- number_with_unit only
    retired_at      timestamptz,                  -- ATR-10
    CHECK ((data_type = 'number_with_unit') = (unit_kind IS NOT NULL))
);
CREATE UNIQUE INDEX ON tenant.attributes (tenant_id, lower(name)) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX ON tenant.attributes (lower(name)) WHERE tenant_id IS NULL;
-- RLS exception, the one table in §3 that needs it: SELECT allows tenant_id IS NULL OR the tenant's
-- own rows; INSERT/UPDATE/DELETE allow only the tenant's own rows (platform rows are written by the
-- operator through the control-plane connection).

CREATE TABLE tenant.attribute_options (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id    uuid NOT NULL REFERENCES tenant.attributes(id),
    tenant_id       uuid,                         -- its own scope: NULL = platform value, else one shop's (same RLS rule)
    value           varchar(80) NOT NULL,
    swatch_color    char(7) CHECK (swatch_color ~ '^#[0-9A-Fa-f]{6}$'),  -- ATR-18, optional
    swatch_image_id uuid,                         -- ATR-18, optional; at most one of the two
    sort_order      integer NOT NULL DEFAULT 0,
    retired_at      timestamptz,
    CHECK (swatch_color IS NULL OR swatch_image_id IS NULL),
    UNIQUE (attribute_id, id)                     -- lets a value row prove its option belongs to its attribute
);
CREATE UNIQUE INDEX ON tenant.attribute_options (attribute_id, lower(value)) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX ON tenant.attribute_options (tenant_id, attribute_id, lower(value)) WHERE tenant_id IS NOT NULL;
-- Decided in Slice 1: an option carries its own scope, so a shop adds its own values ("Ruby 05") to a platform
-- attribute ("Shade") and two shops may each hold the same value. Only enum-single, enum-multi and
-- number-with-unit attributes hold options; a number-with-unit option is a number in its unit kind's base unit
-- (grams, millilitres, a count), so it sorts and compares as one (UOM-02).
-- Foreign keys are checked past row-level security, so triggers refuse any attribute or option reference (here,
-- product_attributes, category_attributes and both value tables) that is neither the platform's nor the row's
-- own shop's (SEC-02).
-- Decided in Slice 1b (PST-04, ATL-01): the operator curates the platform rows through the application role, not
-- a separate connection. attributes, attribute_options and option_sets each carry a `platform_curation` policy
-- allowing writes to rows with no tenant only when the transaction has set app.platform_curation = 'on'
-- (TransactionRunner.enablePlatformCuration, called by the operator's routes alone). A shop's transaction never
-- sets it, so its writes stay its own.

CREATE TABLE tenant.product_attributes (            -- ATL-02, ATL-03
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    attribute_id    uuid NOT NULL REFERENCES tenant.attributes(id),
    role            tenant.attribute_role NOT NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, product_id, attribute_id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products(tenant_id, id)
);
-- Triggers: refuse role = 'variant_defining' for an enum_multi attribute (ATR-01/ATL-02), and for any attribute
-- without options (text, boolean): only enum-single and number-with-unit attributes define variants. Refuse a
-- 4th variant_defining row per product (ATR-14/ATL-03), and a role change away from variant_defining while
-- variants still name it. Role changes after the product has orders are refused in the application (ATR-15),
-- since that needs tenant.order_lines. An attribute's type never changes once made.

CREATE TABLE tenant.product_attribute_values (      -- informational values, product level
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    attribute_id    uuid NOT NULL,
    option_id       uuid REFERENCES tenant.attribute_options(id),   -- enum types; enum_multi = several rows
    text_value      text,
    number_value    numeric(14,4),
    bool_value      boolean,
    CHECK (num_nonnulls(option_id, text_value, number_value, bool_value) = 1),
    FOREIGN KEY (tenant_id, product_id, attribute_id)
        REFERENCES tenant.product_attributes(tenant_id, product_id, attribute_id)
);

CREATE TABLE tenant.variant_attribute_values (      -- ATL-04: what makes each variant distinct
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    variant_id      uuid NOT NULL,
    attribute_id    uuid NOT NULL,
    option_id       uuid NOT NULL,
    PRIMARY KEY (tenant_id, variant_id, attribute_id),
    FOREIGN KEY (tenant_id, product_id, variant_id)
        REFERENCES tenant.product_variants(tenant_id, product_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, product_id, attribute_id)
        REFERENCES tenant.product_attributes(tenant_id, product_id, attribute_id),
    FOREIGN KEY (attribute_id, option_id) REFERENCES tenant.attribute_options(attribute_id, id)
);
-- product_variants.combination_key is built from these rows, in the same transaction, as the sorted
-- "attributeId=optionId" pairs joined by "&". Keyed to the product's own attribute row (decided in Slice 1), so an
-- attribute still naming live variants cannot be removed from the product; a trigger checks it is variant-defining.
-- A retired variant keeps no rows here, only its combination_key, which brings the same variant back.

CREATE TABLE tenant.category_attributes (           -- ATL-05 / ATR-02: suggestions only
    tenant_id       uuid NOT NULL,
    category_id     uuid NOT NULL,
    attribute_id    uuid NOT NULL REFERENCES tenant.attributes(id),
    PRIMARY KEY (tenant_id, category_id, attribute_id),
    FOREIGN KEY (tenant_id, category_id) REFERENCES tenant.categories(tenant_id, id)
);
```

#### Inventory (INV)

```sql
-- Quantities are numeric(14,3) throughout; a trigger refuses a fractional quantity when the product's
-- stock_unit is discrete (piece, dozen, pack, box) — UOM-03.

CREATE TABLE tenant.stock_levels (                  -- INV-01, one row per tracked variant
    tenant_id       uuid NOT NULL,
    variant_id      uuid NOT NULL,
    on_hand         numeric(14,3) NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved        numeric(14,3) NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    unsellable      numeric(14,3) NOT NULL DEFAULT 0 CHECK (unsellable >= 0),  -- INV-13 expired, not yet written off
    available       numeric(14,3) GENERATED ALWAYS AS (on_hand - reserved - unsellable) STORED,
    PRIMARY KEY (tenant_id, variant_id),
    CHECK (on_hand - reserved - unsellable >= 0),  -- overselling is impossible at the data layer
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)
);

CREATE TYPE tenant.stock_reason AS ENUM (           -- INV-04
    'initial', 'purchase_receipt', 'sale', 'return_received', 'damaged', 'lost', 'expired',
    'recount', 'manual_adjustment');

CREATE TABLE tenant.stock_movements (               -- INV-03: append-only ledger
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    variant_id      uuid NOT NULL,
    batch_id        uuid,                         -- INV-12, when batch-tracked
    quantity_delta  numeric(14,3) NOT NULL CHECK (quantity_delta <> 0),
    on_hand_after   numeric(14,3) NOT NULL,
    reason          tenant.stock_reason NOT NULL,
    unit_cost       numeric(12,4),                -- INV-11; null = unknown, never 0
    reference_type  text,                         -- 'order' | 'purchase_receipt' | 'stock_check' | null
    reference_id    uuid,
    actor_user_id   uuid,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)
);
CREATE INDEX ON tenant.stock_movements (tenant_id, variant_id, id DESC);   -- INV-09 history
-- Insert-only trigger (same as tenant.balance_ledger / tenant.activity_log): UPDATE/DELETE refused for
-- every role. INV-05: stock_levels.on_hand = SUM(quantity_delta) per variant, provable by test.

CREATE TABLE tenant.stock_batches (                 -- INV-12
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    variant_id      uuid NOT NULL,
    batch_code      text,
    expires_on      date,                         -- null = no expiry, drawn last
    quantity        numeric(14,3) NOT NULL CHECK (quantity >= 0),
    received_at     timestamptz NOT NULL DEFAULT now(),
    expiry_notified_at timestamptz,               -- INV-13 once per batch
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)
);
CREATE INDEX ON tenant.stock_batches (tenant_id, variant_id, expires_on NULLS LAST, received_at)
    WHERE quantity > 0;                           -- FEFO pick order

CREATE TYPE tenant.serial_status AS ENUM ('in_stock', 'reserved', 'sold', 'returned', 'written_off');

CREATE TABLE tenant.serial_numbers (                -- INV-14
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    variant_id      uuid NOT NULL,
    serial          text NOT NULL,
    status          tenant.serial_status NOT NULL DEFAULT 'in_stock',
    received_movement_id bigint,
    sold_order_id   uuid,
    UNIQUE (variant_id, serial),
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)
);

CREATE TYPE tenant.reservation_status AS ENUM ('active', 'consumed', 'released');

CREATE TABLE tenant.stock_reservations (            -- INV-15, INV-16
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    variant_id      uuid NOT NULL,
    order_id        uuid NOT NULL,                -- FK added in Phase 4 when tenant.orders exists
    quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
    status          tenant.reservation_status NOT NULL DEFAULT 'active',
    expires_at      timestamptz,                  -- set only while awaiting online payment
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz,
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)
);
CREATE INDEX ON tenant.stock_reservations (expires_at) WHERE status = 'active' AND expires_at IS NOT NULL;
-- INV-05: stock_levels.reserved = SUM(quantity) of this variant's active reservations.

CREATE TABLE tenant.stock_checks (                  -- INV-07: groups one stock check's recount movements
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    actor_user_id   uuid,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

#### Purchasing (PUR)

```sql
CREATE TABLE tenant.suppliers (                     -- PUR-01
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    name            varchar(200) NOT NULL,
    phone           varchar(15),
    email           varchar(254),
    address         text,
    notes           text,
    archived_at     timestamptz,
    UNIQUE (tenant_id, id)
);

CREATE TABLE tenant.purchase_counters (             -- PUR-03, same locked-row pattern as invoice_counters
    tenant_id       uuid PRIMARY KEY,
    last_number     integer NOT NULL DEFAULT 0
);

CREATE TYPE tenant.purchase_status AS ENUM
    ('draft', 'ordered', 'partially_received', 'received', 'closed_short', 'cancelled');

CREATE TABLE tenant.purchase_orders (               -- PUR-02
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    number          integer NOT NULL,
    supplier_id     uuid,
    status          tenant.purchase_status NOT NULL DEFAULT 'draft',
    expected_on     date,
    notes           text,
    close_reason    text,                         -- PUR-06
    created_at      timestamptz NOT NULL DEFAULT now(),
    ordered_at      timestamptz,
    UNIQUE (tenant_id, number),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES tenant.suppliers(tenant_id, id)
);

CREATE TABLE tenant.purchase_order_lines (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    variant_id        uuid NOT NULL,
    quantity_ordered  numeric(14,3) NOT NULL CHECK (quantity_ordered > 0),
    quantity_received numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost         numeric(12,4) CHECK (unit_cost >= 0),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES tenant.purchase_orders(tenant_id, id),
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)
);
-- PUR-05 incoming = SUM(quantity_ordered - quantity_received) over lines of 'ordered' /
-- 'partially_received' orders; never part of stock_levels.

CREATE TABLE tenant.purchase_receipts (             -- PUR-04, immutable (PUR-08)
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL,
    purchase_order_id uuid NOT NULL,
    received_at       timestamptz NOT NULL DEFAULT now(),
    actor_user_id     uuid,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES tenant.purchase_orders(tenant_id, id)
);

CREATE TABLE tenant.purchase_receipt_lines (
    tenant_id          uuid NOT NULL,
    receipt_id         uuid NOT NULL,
    purchase_line_id   uuid NOT NULL,
    quantity_accepted  numeric(14,3) NOT NULL CHECK (quantity_accepted >= 0),
    quantity_rejected  numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
    reject_reason      text,
    unit_cost          numeric(12,4) CHECK (unit_cost >= 0),
    batch_id           uuid,                      -- created by this receipt when batch-tracked
    movement_id        bigint,                    -- the purchase_receipt stock movement it wrote
    PRIMARY KEY (tenant_id, receipt_id, purchase_line_id),
    FOREIGN KEY (tenant_id, receipt_id) REFERENCES tenant.purchase_receipts(tenant_id, id),
    FOREIGN KEY (tenant_id, purchase_line_id) REFERENCES tenant.purchase_order_lines(tenant_id, id)
);
-- PUR-07 "Add stock" writes a purchase_orders row already 'received' plus one receipt, in one transaction.
```

#### Product landing pages (LND)

```sql
CREATE TABLE tenant.product_slug_redirects (       -- LND-04: an old slug keeps resolving after a change
    tenant_id       uuid NOT NULL,
    old_slug        text NOT NULL,
    product_id      uuid NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, old_slug),
    FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products(tenant_id, id)
);
-- A slug is set at creation and never follows a rename; a deliberate slug change inserts the old one
-- here, and a new product may not take a slug still held here. Public lookup: products.slug first,
-- then this table (answering 301 to the product's current slug).

CREATE TABLE tenant.ad_tracking_settings (          -- LND-15 to LND-17, one row per tenant
    tenant_id             uuid PRIMARY KEY,
    meta_pixel_id         text,                      -- public; rendered into landing pages
    meta_capi_token_enc   bytea,                     -- Conversions API token, encrypted (SEC-10), never returned
    updated_at            timestamptz NOT NULL DEFAULT now()
);
```

Orders created from a landing page carry `source = 'landing_page'` on `tenant.orders` (Phase 4, LND-09);
the same column distinguishes storefront, dashboard and API orders (SFT-06).

#### Delivery zones, size charts, option sets and the catalog feed (DLV, PRD-17, ATR-16, FED)

```sql
CREATE TABLE tenant.delivery_zones (                -- DLV-01; seeded with two rows for every tenant
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    name            varchar(60) NOT NULL,
    charge          numeric(10,2) NOT NULL CHECK (charge >= 0),
    is_fallback     boolean NOT NULL DEFAULT false, -- DLV-02: exactly one per tenant, never deleted
    is_home         boolean NOT NULL DEFAULT false, -- DLV-01: "Inside <home area>", exactly one, never deleted
    auto_named      boolean NOT NULL DEFAULT true,  -- DLV-01: follows the home area's name until renamed
    no_delivery     boolean NOT NULL DEFAULT false, -- DLV-06: public orders to this zone are refused
    UNIQUE (tenant_id, id)
);
CREATE UNIQUE INDEX delivery_zones_one_fallback ON tenant.delivery_zones (tenant_id) WHERE is_fallback;
CREATE UNIQUE INDEX delivery_zones_one_home ON tenant.delivery_zones (tenant_id) WHERE is_home;

CREATE TABLE tenant.delivery_zone_areas (           -- DLV-01, DLV-02: CUS-08 areas at four levels
    tenant_id       uuid NOT NULL,
    zone_id         uuid NOT NULL,
    division_code   text,                           -- exactly one of these four is set
    zilla           text,                           -- a whole district, by its control.locations.zilla
    city_code       text,                           -- a whole city area (control.cities)
    location_id     integer,                        -- one thana (control.locations.id)
    CHECK (num_nonnulls(division_code, zilla, city_code, location_id) = 1),
    FOREIGN KEY (tenant_id, zone_id) REFERENCES tenant.delivery_zones(tenant_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ON tenant.delivery_zone_areas (tenant_id, division_code) WHERE division_code IS NOT NULL;
CREATE UNIQUE INDEX ON tenant.delivery_zone_areas (tenant_id, zilla) WHERE zilla IS NOT NULL;
CREATE UNIQUE INDEX ON tenant.delivery_zone_areas (tenant_id, city_code) WHERE city_code IS NOT NULL;
CREATE UNIQUE INDEX ON tenant.delivery_zone_areas (tenant_id, location_id) WHERE location_id IS NOT NULL;
-- Resolution (DLV-02): the zone naming the thana, else its city, else its zilla, else its division, else the
-- fallback zone. Cities and divisions are stored as groups, never expanded, so platform changes flow through.
-- Every tenant starts with the home zone (one area: city_code 'dhaka', charge 70) and the fallback (130).
-- The order line stores its computed delivery_charge (ORD-46), so editing a zone never changes old orders.

CREATE TABLE tenant.product_delivery_zones (        -- DLV-07: no rows = the product goes wherever the shop delivers
    tenant_id       uuid NOT NULL,
    product_id      uuid NOT NULL,
    zone_id         uuid NOT NULL,
    PRIMARY KEY (product_id, zone_id),
    FOREIGN KEY (tenant_id, product_id) REFERENCES tenant.products(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, zone_id) REFERENCES tenant.delivery_zones(tenant_id, id)  -- no cascade: DLV-07
);

CREATE TABLE tenant.size_charts (                   -- PRD-17: one per product or per category
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL,
    product_id      uuid,
    category_id     uuid,
    image_id        uuid,                           -- an image chart (MED-03) ...
    table_rows      jsonb,                          -- ... or a table: up to 15 rows x 10 cells of short text
    CHECK ((product_id IS NULL) <> (category_id IS NULL)),
    CHECK ((image_id IS NULL) <> (table_rows IS NULL))
);
CREATE UNIQUE INDEX size_charts_product ON tenant.size_charts (tenant_id, product_id) WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX size_charts_category ON tenant.size_charts (tenant_id, category_id) WHERE category_id IS NOT NULL;
-- Built in Slice 1b (0052) as a table only: table_rows NOT NULL, with no image_id until media lands (Slice 6),
-- when the image-or-table check above replaces it. Composite (tenant_id, product_id) and (tenant_id, category_id)
-- keys cascade with their owner. A product without its own chart shows the one on its primary category or the
-- nearest category above it (PRD-17), resolved when the product is read.

CREATE TABLE tenant.option_sets (                   -- ATR-16; tenant_id NULL = platform set (same scope rule as attributes)
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid,
    name            varchar(60) NOT NULL,           -- 'S–XXL', 'Shoe 38–44', 'Common colors'
    preset_key      text,                           -- platform sets offered first for this shop type (PST)
    options         text[] NOT NULL CHECK (cardinality(options) BETWEEN 1 AND 50),
    sort_order      integer NOT NULL DEFAULT 0,
    CHECK (tenant_id IS NULL OR preset_key IS NULL)  -- only a platform set is offered by shop type
);
-- Built in Slice 1b (0052), with the attribute library's two-scope policies and unique lower(name) per scope.
-- The values are plain text, matched to or added as options of whichever attribute they are inserted into
-- (POST attributes/:id/options/batch), so a set is never tied to one attribute. Seeded: "S–XXL" (clothing),
-- "Shoe 38–44" (shoes_bags) and "Common colors", whose values are the platform Color options seeded with
-- their swatches (ATR-18).

CREATE TABLE tenant.catalog_feeds (                 -- FED-01, FED-05: one row per tenant
    tenant_id       uuid PRIMARY KEY,
    token_hash      bytea NOT NULL UNIQUE,          -- SHA-256 of the 128-bit URL token, for lookup
    token_enc       bytea NOT NULL,                 -- encrypted (SEC-10) so the dashboard can show the URL (FED-06)
    rotated_at      timestamptz NOT NULL DEFAULT now()
);
-- The feed is rendered from the public catalogue read model and cached by catalogue version (FED-04);
-- it has no table of its own beyond the token.
```

#### Combo packs (CMB) — Phase 4

```sql
CREATE TABLE tenant.combo_parts (                   -- CMB-01: a combo product's parts
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    combo_product_id uuid NOT NULL,
    position         smallint NOT NULL CHECK (position BETWEEN 1 AND 10),          -- CMB-10
    quantity         numeric(14,3) NOT NULL CHECK (quantity > 0 AND quantity <= 20), -- per combo (UOM-03)
    UNIQUE (tenant_id, id),
    UNIQUE (combo_product_id, position),
    FOREIGN KEY (tenant_id, combo_product_id) REFERENCES tenant.products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE tenant.combo_part_variants (           -- CMB-01: allowed variants; exactly one = a fixed part
    tenant_id        uuid NOT NULL,
    part_id          uuid NOT NULL,
    variant_id       uuid NOT NULL,
    PRIMARY KEY (part_id, variant_id),
    FOREIGN KEY (tenant_id, part_id) REFERENCES tenant.combo_parts(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, variant_id) REFERENCES tenant.product_variants(tenant_id, id)  -- no cascade: CMB-08
);
CREATE INDEX ON tenant.combo_part_variants (tenant_id, variant_id);  -- CMB-02: combos to recompute on a stock change
-- A trigger refuses an allowed variant whose product is itself a combo (CMB-01, no nesting) and more than
-- 100 allowed variants per part (CMB-10). A combo has one product_variants row (combination_key '') and no
-- stock_levels row; its products.stock_state is recomputed from its parts inside InventoryLedger.apply().

CREATE TABLE tenant.order_line_components (         -- CMB-03, CMB-04: a combo line's component variants
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    order_line_id    uuid NOT NULL REFERENCES tenant.order_lines(id),
    part_position    smallint NOT NULL,
    variant_id       uuid,                          -- advisory only, like order_lines.variant_id (ORD-46)
    -- snapshot, copied at order time:
    product_name     text NOT NULL,
    attribute_values jsonb NOT NULL DEFAULT '{}',
    quantity         numeric(14,3) NOT NULL CHECK (quantity > 0)   -- units of this variant in one combo
);
CREATE INDEX ON tenant.order_line_components (tenant_id, order_line_id);
-- A choice part picked as M-Red, M-Red, L-Black gives two rows: M-Red 2 and L-Black 1. Reservations and
-- stock movements for a combo line are ordinary per-variant rows referencing the order (CMB-03, CMB-05);
-- the stock-history label finds the combo through this table by order and variant.
```

#### Shop-type presets (PST) — `control` schema, platform-wide

```sql
CREATE TABLE control.business_type_presets (        -- PST-01, PST-04
    key                 text PRIMARY KEY,          -- 'clothing', 'cosmetics', 'grocery', ...
    label_bn            text NOT NULL,
    label_en            text NOT NULL,
    default_stock_unit  text NOT NULL DEFAULT 'piece',
    default_batch       boolean NOT NULL DEFAULT false,
    default_serial      boolean NOT NULL DEFAULT false,
    default_not_tracked boolean NOT NULL DEFAULT false,
    default_low_stock   numeric(14,3) NOT NULL DEFAULT 5,
    suggested_attribute_ids uuid[] NOT NULL DEFAULT '{}',
    suggested_categories    jsonb NOT NULL DEFAULT '[]',
    up_front_fields         text[] NOT NULL DEFAULT '{}'  -- PST-05 (Slice 1b): ProductFormField names shown
                                                          -- before "More settings"
);
-- The operator edits rows through PATCH operator/presets/:key (PST-04; the application role holds UPDATE on this
-- table from 0052). The key never changes: shops and categories hold it by value.
-- control.tenants gains business_type text REFERENCES control.business_type_presets(key), nullable.
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
    area_courier_key text,                           -- CUS-13: the courier the stored area belongs to
    courier_area_code text,                          -- CUS-12/13: from the form or chosen by staff; never sets the delivery zone
    courier_key     text,                            -- set once booked
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
    quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),  -- UOM-04: decimals only for measured units
    pack_amount     numeric(14,3),                -- INV-24: shared-stock units per unit sold; null otherwise
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
                                                          -- order_fee | product_fee | plan_payment | adjustment | reversal |
                                                          -- carry_over (LIF-21: a deleted shop's balance moved to the new one)
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
-- D2-3 (added 2026-10-13): a frozen copy of the control.plans row, inserted immediately before
-- every update (PLN-02) -- not reconstructed from platform_audit_log's free-form summary field,
-- since the plan editor needs to actually render a past version, not just diff two JSON blobs.
CREATE TABLE control.plan_versions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         uuid NOT NULL REFERENCES control.plans(id),
    version         integer NOT NULL,              -- the version number this snapshot WAS, before the edit
    name            text NOT NULL,
    description     text,
    rank            integer NOT NULL,
    for_sale        boolean NOT NULL,
    limits          jsonb NOT NULL,
    features        jsonb NOT NULL,
    recorded_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (plan_id, version)
);

-- PLN-11: a per-tenant override of one limit key, with a required reason. Applied over the
-- tenant's plan_snapshot when the app reads a limit; removing the row restores the snapshot value.
CREATE TABLE control.plan_limit_overrides (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    limit_key       text NOT NULL,                 -- a key from the plan's `limits` jsonb, e.g. 'free_essential_sms'
    value           jsonb NOT NULL,
    reason          text NOT NULL,
    set_by          uuid NOT NULL,                 -- operator account id
    set_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, limit_key)
);

-- D2-1 (added 2026-10-13): a plan purchase, renewal, upgrade or balance top-up's confirmation
-- row. Deliberately control-schema, not the tenant-schema `tenant.payment_sessions`/`payments`
-- (section 3.4) -- those are Phase 5's *shopper* order-payment mechanism, built against
-- tenant.orders, which doesn't exist yet and can't be depended on by this phase. A plan payment
-- is the tenant itself paying the platform, conceptually closer to control.invoices than to a
-- shopper's checkout. Today's `verified`/`rejected` transition is an operator action (API-CONTRACT.md
-- §9's /operator/payment-queue) standing in for Phase 5's real hosted-page/gateway verification;
-- only the confirmation trigger changes once Phase 5 ships, not this table's shape.
CREATE TABLE control.plan_payments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    kind            text NOT NULL,                  -- purchase | renewal | upgrade | top_up
    plan_id         uuid REFERENCES control.plans(id),       -- null for a top_up
    billing_term_id uuid REFERENCES control.billing_terms(id), -- null for a top_up
    amount          numeric(10,2) NOT NULL,         -- the amount due/quoted (BIL-09's 30-minute hold window)
    credit_amount   numeric(10,2) NOT NULL DEFAULT 0, -- UPG-03, for kind = 'upgrade'
    quoted_at       timestamptz NOT NULL DEFAULT now(),
    status          text NOT NULL DEFAULT 'pending', -- pending | needs_review | verified | rejected | expired
    sender_number   text,
    transaction_id  text,
    verified_by     uuid,                           -- operator account id
    verified_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
-- BIL-07/PAY-16: the transaction_id uniqueness guarantee is platform-wide via
-- control.used_transaction_ids (section 2.4/3.4), the same registry tenant.payments shares,
-- so a plan payment and a shopper payment can never collide on the same transaction ID either.
CREATE UNIQUE INDEX ON control.plan_payments (transaction_id) WHERE transaction_id IS NOT NULL;

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
    key             text NOT NULL UNIQUE,           -- extra_orders | extra_products | extra_seat | extra_storage | extra_bandwidth | extra_requests | brand_identity | fraud_check_allowance | extraction_allowance
    kind            text NOT NULL CHECK (kind IN ('limit', 'pack', 'feature', 'allowance')),  -- PLN-13, amended 2026-10-18; allowance: PLN-20
    unit_size       numeric(12,2),                  -- null for a feature add-on
    price           numeric(10,2) NOT NULL,
    retired_at      timestamptz
);

CREATE TABLE control.addon_purchases (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES control.tenants(id),
    addon_id        uuid NOT NULL REFERENCES control.addons(id),
    quantity        integer NOT NULL DEFAULT 1,
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'lapsed')),
    paid_from       text NOT NULL CHECK (paid_from IN ('balance', 'payment')),  -- PLN-14: balance (BIL-08) or directly
    plan_payment_id uuid REFERENCES control.plan_payments(id),  -- set when paid directly (BIL-03)
    renews          boolean NOT NULL DEFAULT true,   -- PLN-14: renews with the plan unless switched off
    purchased_at    timestamptz NOT NULL DEFAULT now(),
    starts_at       timestamptz,                     -- set when it takes effect (at once from balance, on confirmation if paid directly)
    uses_left       integer CHECK (uses_left >= 0),  -- PLN-20: an allowance's uses left this period; null for other kinds
    expires_at      timestamptz NOT NULL            -- PLN-14: end of the plan period, or a [30]-day period for pay-as-you-go
);
-- Limits are calculated as plan snapshot + operator overrides (PLN-11) + active limit add-ons. A pack is
-- consumed rather than expiring; the tenant's auto-buy opt-in (PLN-15) is a setting on the tenant.
-- An allowance (PLN-20) is used before the balance: each fake-order check or order read takes one from
-- uses_left in the same transaction as the check or read; at 0, or after expires_at, it is charged from
-- the balance again. A renewal sets uses_left back to the full number.

-- DWN/UPG/LIF (downgrade, upgrade, lifecycle) need no new tables: they're operations that
-- read/write control.tenants.state, .plan_snapshot, .period_start/end and write a
-- control.platform_audit_log row (LIF-25, DWN-17). A scheduled downgrade is one extra row:
CREATE TABLE control.scheduled_plan_changes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL UNIQUE REFERENCES control.tenants(id), -- one pending change at a time (UPG-08 pattern)
    kind            text NOT NULL,                  -- downgrade | pay_as_you_go_switch (PYG-10)
    target_plan_id  uuid REFERENCES control.plans(id), -- null for pay_as_you_go_switch
    effective_at    timestamptz NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
```

**Pay-as-you-go (PYG):** no new tables. A pay-as-you-go tenant is `control.tenants` with `plan_id` set to the seeded, not-for-sale "Pay-as-you-go" plan, `state = 'pay_as_you_go'`, `period_end NULL` and `period_start` set to the moment it switched (the idle clock's start, PYG-21). Its order fee and product fee are ordinary `tenant.balance_ledger` rows (`type = 'order_fee' | 'product_fee'`), charged at the moment `tenant.orders.handled_at` is set (PYG-02) or at product creation (PYG-16) — the same ledger every other charge uses.

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
    paid_from       text CHECK (paid_from IN ('balance', 'allowance')),  -- PLN-20; null when nothing was charged (FRD-03)
    checked_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.fraud_checks (tenant_id, phone, checked_at DESC);

-- ORD-30 to ORD-34, PLN-20: one row per successful order read from text. The pasted message itself is
-- not kept; the row exists to show what each read used.
CREATE TABLE tenant.order_extractions (
    id              bigserial PRIMARY KEY,
    tenant_id       uuid NOT NULL,
    user_id         uuid NOT NULL,
    input_chars     integer NOT NULL CHECK (input_chars BETWEEN 1 AND 4000),  -- ORD-33
    confidence      numeric(4,3),
    paid_from       text NOT NULL CHECK (paid_from IN ('balance', 'allowance')),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant.order_extractions (tenant_id, created_at DESC);

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
    used_at         timestamptz,                    -- NULL = still valid; set once on use, never reused
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Added 2026-10-09 (D30): mirrors control.sessions' shape, kept as its own table rather than reusing it —
-- sessions.subscriber_id is NOT NULL, tied to tenant sign-in, so an operator session can never share that
-- table (ADM-01's own "separate account space", applied to sessions too, not only accounts).
CREATE TABLE control.operator_sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      text NOT NULL UNIQUE,            -- SHA-256 of the cookie value, never the value (SEC-07)
    csrf_hash       text NOT NULL,                   -- SHA-256 of the per-session CSRF token (SEC-14)
    operator_id     uuid NOT NULL REFERENCES control.operator_accounts(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,            -- D30: 12 hours, deliberately shorter than sessions' 7 days
    revoked_at      timestamptz,
    user_agent      text,
    ip              inet
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
- The job queue itself (SCL-08: one PostgreSQL-backed interface), **decided 2026-10-07 (D25): pg-boss**, not a hand-rolled `control.jobs` table. pg-boss manages its own schema and tables; this codebase reaches it only through its own queue interface (per SCL-08), never pg-boss's API directly from a caller, so the library stays swappable. Not spelled out further here since it doesn't affect any other table's design. Replaces the hand-rolled `SmsOutbox` table and `SmsWorker` (`packages/db`/`apps/server`, messaging; not otherwise documented in this file); email's outbox is built on the same library from the start. One table this codebase does own: `control.job_outbox`, the enqueue step's own atomicity boundary (a row commits in the same transaction as the business write that caused it; a relay hands it to pg-boss afterwards) — its columns, including the per-job `expire_in_seconds`/`retry_limit`/`retry_delay` a caller can set (D27), are an implementation detail of the queue interface, not a business table, so they stay undocumented here beyond this note.

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
