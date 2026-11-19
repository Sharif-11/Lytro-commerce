# Offers -- plan

**Status:** the sketch, OF-13 to OF-25 and the build plan approved by the owner (2026-11-19, two PRs). Both built
(section 5): PR 1 merged (#401); PR 2, the design editor's offer row and button, merges once PR 1 is live on staging.

**What it is:** a seller runs a named offer ("ঈদ অফার") that cuts the price of chosen products, or of some designs of a
product, by a percent or by taka. Shoppers see the cut price everywhere in the shop, with the old price struck through,
and the offer gets its own page and can be a row on the home page.

**Sketch:**
- Dashboard: `docs/brand/lytro-dashboard.html`, group "Offers (sketch)" (`of-*` screens).
- Shop and the design editor: `docs/brand/lytro-storefront-builder.html`, the `o-*` screens.

## 1. The owner's answers (2026-11-18)

| # | Question | Answer |
| --- | --- | --- |
| OF-1 | Where offers are made | **A separate Offers page** in the dashboard, offers by name, each with its products and its cut. |
| OF-2 | How much off | **% off (the default) or ৳ off**, each product's offer price worked out from its own price, previewed before starting. |
| OF-3 | Ending | **An End button now** (old prices back at once); a start and end date later, as its own feature. |
| OF-4 | Shipping | **Its own PR**, after design cards. |
| OF-5 | Kinds of offer in the first PR | **Price cuts only.** Free delivery, spend-more discounts and coupon codes are each their own feature later. |
| OF-6 | How an offer changes the price | **The offer sets the price.** Starting saves each product's current price, sets the offer price and shows the old one struck through; End puts the saved prices back. While a product is in an offer its price is locked in the product editor. |
| OF-7 | A product in two offers | **One offer at a time.** The picker shows "In <offer>" and cannot pick it until it is taken out of that offer or the offer ends. |
| OF-8 | Shown to shoppers | **Its own page and a home row:** a link (`/offers/<name>`) to share in ads, and a choice in the home page's product rows. Cards stay as they are. |
| OF-9 | What is picked | **A product, or only some of its designs.** A product picked whole has every size and design in the offer. |
| OF-10 | A product already on sale | **The cut is from today's selling price.** Regular ৳1,000 selling at ৳900, 10% off: ৳810, with ৳1,000 still struck through. Ending puts back ৳900 (৳1,000 struck through). |
| OF-11 | Rounding | **Down to whole taka** (৳1,011.50 becomes ৳1,011). |
| OF-12 | An ended offer's link | **"This offer has ended"**, the same products at their prices now, and a link to what is on sale now. |

## 2. My calls in the sketch (approved 2026-11-19)

The owner confirmed OF-14 (Start later), OF-15 (live edits) and OF-16 (per design) by name, and the rest with the
sketch.

| # | Call | Why |
| --- | --- | --- |
| OF-13 | **Offers sits in Shop, right after Products.** | Sellers reach it while thinking about products; on a phone it shows without scrolling the section chips. |
| OF-14 | **Three states: Not started, Running, Ended.** "Start later" keeps an offer ready (e.g. the night before Eid) without changing any price. Ended offers stay listed, with **Run it again** (a copy, not started) and **Delete**. | Until dates come (OF-3), getting an offer ready ahead is the closest thing; old offers are worth repeating. |
| OF-15 | **A running offer can change:** products added or taken out, and the cut changed, each live at once. | A seller fixing a mistake should not have to end and restart. |
| OF-16 | **"One offer at a time" counts running and not-started offers, per design.** One design of a burka may be in the Eid offer while another design is in a Flash sale. | Matches OF-7 and OF-9 without blocking a whole product for one design. |
| OF-17 | **What is locked:** the price of every size of each design in an offer, and the product's own price when the whole product is in it. The editor shows which designs are in which offer, with Open offer. | OF-6; the rest of the product stays editable. |
| OF-18 | **Limits:** a percent from 1 to 90; taka off at least ৳1, and no picked product may end below ৳1. Start shows each product that cannot take the cut and stays off until it is fixed. | A ৳0 product would be given away. |
| OF-19 | **A size or design added later:** a new size of a design in the offer joins it at the same cut; a new design of a product with only some designs in the offer does not. | It follows what the seller picked. |
| OF-20 | **Orders already placed keep the offer price** after End. | Orders charge the price at the time (SB-21). |
| OF-21 | **The offer's link** is `/offers/` and its name (Bangla kept, as product links are). A not-started offer's link is "not found" until it starts. | Same rule as product links (PRD-02). |
| OF-22 | **The home row and buttons:** only a running offer can be picked; the row leaves the home page by itself when the offer ends (the editor marks it "Offer ended"); a button to an ended offer leads to On sale. | Shoppers never land on an empty row. |
| OF-23 | **The products list marks a product in an offer** with the offer's name. | The seller sees why a price is locked before opening it. |
| OF-24 | **Who can run offers:** whoever can edit products. | Offers change prices, which is product editing. |
| OF-25 | **The picker:** search, category chips with Select all, a product with designs opens to tick some of them; combo packs, hidden and sold-out products can be picked. | One place to pick a whole category or one design. |

## 3. Screens

**Dashboard (Shop > Offers):**
- `of-list`, `of-empty`: the offers by state; the first-time screen.
- `of-new`, `of-pick`, `of-bad`: making an offer (its name, the cut, its products with each new price), the picker, and a cut too big for some products.
- `of-offer`, `of-change`, `of-end`, `of-ended`: a running offer (its link, products, Change, End), changing the cut, the End dialog, and the offer once ended.
- `of-product`, `of-products`: the product editor with two designs in an offer (price locked); the products list marking it.

**Design editor and shop:**
- `o-row`, `o-link`: a home row of an offer; a button that leads to an offer.
- `o-home`, `o-page`, `o-ended`: the row in the shop, the offer's page, and the page after the offer ends.

## 4. Build plan

### 4.1 Two PRs

1. **Offers** -- everything below except the design editor's two new choices: the tables, the server, the public
   reads, the dashboard's Offers screens, the product editor and products list, and the shop's offer page. The design
   document learns to READ a home row of an offer and a button to an offer, and the shop draws them.
2. **Offers in the design editor** -- the editor offers "An offer" for a product row and for a button, after PR 1 is
   live on staging.

Why two: the design document is checked strictly, so a release that does not know "an offer" would refuse a shop's
whole design and show the starting design instead. Readers go first (PR 1), writers second (PR 2), so neither a deploy
(two copies of the API side by side) nor a rollback can hit a shop's design.

### 4.2 Storage (one migration, the next free number)

- `tenant.offers`: name, link name (unique in the shop), cut (`percent` or `taka`, and its amount), state
  (`waiting`, `running`, `ended`), started and ended times.
- `tenant.offer_items`: what was picked -- a product, and one of its designs or none (none = the whole product). Kept
  after the offer ends, for its ended page and Run it again.
- `tenant.offer_prices`: while an offer runs, one row per size it has changed: the size's own price and regular price
  before (each may be empty, meaning "the product's"), and the offer price. **A size can have one row only**, so no size
  is ever in two running offers, whatever happens at the same moment.
- Each with row-level security and keys to the shop's products, designs and sizes (deleting one removes it from the
  offer). Migration kind: add; previous release leaves the tables unread.

### 4.3 How an offer changes prices (OF-6, OF-10, OF-11, OF-17, OF-19)

- **Start**: for each size picked (all sizes of a whole product, or every size of a picked design), save its price and
  regular price as they are, then set the size's own price to the offer price and its own regular price to the old
  regular price (or the old price when it had none). Offer price = today's price less the cut, rounded down to whole
  taka. The product's own price is not touched, so its other designs keep selling as before.
- **End**: put each saved price and regular price back exactly as it was, and remove the rows. Orders already placed
  keep what they charged.
- **Live edits** (OF-15): a product added gets its prices at once; one taken out gets its old prices back; a new cut is
  worked out again from the saved prices.
- **A size added later** to a design (or whole product) in a running offer joins it at the same cut.
- **Locks**: the product editor refuses a price change to a size in a running offer, and to the product's own price
  when the whole product is in one (each refusal names the offer).
- **One at a time per design** (OF-16): starting, adding or Run it again refuses a product or design already in another
  running or not-started offer, naming it.
- **Limits** (OF-18): 1 to 90 percent; taka off a whole number from ৳1; start refuses any product that would fall
  below ৳1, naming each.
- Every change runs in one transaction, moves the catalogue's version and clears the shop's pages from the edge, as a
  product save does. Starting, changing and ending each go in the shop's Activity.

### 4.4 Routes

- **Dashboard** (`products:read` to read, `products:manage` to change): list offers; read one (its products with each
  price before and in the offer); a preview of prices for a cut and products before saving; create (start now or
  later); change the name, cut or products; start; end; Run it again (a not-started copy); delete (not started or
  ended); the picker's list (products with their designs, each marked when in another offer).
- **Product reads** gain the offers a product's designs are in (the editor's card and locks), and the products list
  gains each product's offer name (the tag).
- **Public**: an offer by its link name (name, cut, running or ended; a not-started offer is not found), and the
  product list filtered to an offer's cards (each design card in it, as design cards show them). Both counted like
  every public request.

### 4.5 Screens

- **Dashboard**: Offers in Shop after Products; the list, new offer, picker, offer, change, end, ended screens; the
  product editor's offer card and locked prices; the products list tag -- pixel-matched to the sketch.
- **Shop**: `/offers/<name>` -- the offer's head and every card, with Sort and Load more; the ended note with "What's
  on sale now". A home row of an offer (hidden once it ends) and a button to an offer (On sale once it ends) are drawn
  in PR 1 and chosen in the editor in PR 2.

### 4.6 Tests and checks

- Server: an offers spec -- start and end put every price back exactly (own price empty or set, already on sale),
  rounding, limits, per-design conflicts including not-started offers, live edits, a size added later, the editor's
  refusals, an order placed during the offer keeping its price after End, the public offer read and list filter, and
  another shop's offer or product refused; the route inventory and isolation registry, the catalogue-cache spec, field
  labels in both languages.
- Dashboard and shop browser tests for each screen, with pictures beside the sketch.
- Every package's checks, Prettier, the migration rules check, a real boot of the built server.

### 4.7 Not in these PRs

Offer dates (start and end on their own), free delivery, spend-more discounts, coupon codes, and sales figures per
offer -- each its own feature later.

## 5. As built (PR 1)

- **Storage:** migration 0145 (`offers`, `offer_items`, `offer_prices`), as section 4.2. An offer sets each size's own
  price and regular price (a product without sizes has one, its own variant), never the product's own price.
- **Locks (OF-17):** the product editor refuses a price or regular price change to a size a running offer priced, and
  the product's own price while the whole product is in one, naming the offer (`409`, `ProductPriceInOffer`). A
  product copied (PRD-18) takes each size's price from before the offer.
- **A size added later (OF-19)** joins its running offer at its cut, from its own price then (a new size of a design
  sells at the product's price until the seller sets its own).
- **Public:** `GET /v1/catalogue/offers/:slug` and `offer=` on the product list; the shop's design names the running
  offers its rows and buttons point at (`design.offers`), so a row of an ended offer hides and a button goes to On
  sale (OF-22). The design document reads `source: offer` (`offerId`) and links of kind `offer`; the editor writes
  them in PR 2.
- **Dashboard:** Shop › Offers after Products; the list, a new offer (or one not started) with its picker, a running
  offer (its link, Change, live products, End), an ended one (Run it again, Delete); the product editor's offer card
  and locked prices; the products list's tag; Activity names each start, change, end and delete.
- **Shop:** `/offers/<link name>` (Bangla link names too) -- the offer's tag, name and line over its cards with Sort
  and "In stock only"; once ended, the note and "What's on sale now".

**Named deviations from the sketch:**
- **The dashboard's own parts** (cards, chips, fields, rows, tags, dialogs, the action bar).
- **No "show it on the home page" hint** on the running offer's page until PR 2 adds the editor's choice it names
  (PR 2 adds it: see below).
- **End offer and Delete are red words** on the dashboard's outline button, as its other red actions are (the sketch
  drew a red edge too).
- **"Started" shows the day** ("15 Nov"), as the dashboard's other dates in a line do.
- **An offer's products are listed by name**, a product's picked designs in one row.
- **The shop's offer page writes numbers in Western digits**, as the shop's other lines do.

### As built (PR 2)

- **A home row of an offer (OF-8, OF-22; the sketch's `o-row`):** the product row's source gains "An offer". Its Offer
  field lists the running offers, each with its product count, and keeps the one the row already names, marked "Ended:
  the row is hidden". Done asks "Choose the offer." until one is picked. The row's title defaults to the offer's name,
  "See all" opens the offer's page, and the section's line reads "Auto: N from <offer>".
- **A button to an offer (the sketch's `o-link`):** "Button leads to" gains "An offer", second after On sale, listing
  the offers not ended. A running one can be picked; one not started is shown with "Not started" and cannot be. The
  button then reads "Offer: <name>".
- **The running offer's page** shows the home-row hint the sketch drew, with Open design.
- **Unchanged:** the server's checks, the shop's rows and links, and `design.offers` are PR 1's. Nothing new is stored.
