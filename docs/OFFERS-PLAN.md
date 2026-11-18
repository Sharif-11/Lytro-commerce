# Offers -- plan

**Status:** sketch for the owner's review (2026-11-19). No code until the sketch is approved.

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

## 2. My calls in the sketch (for the owner to approve or change)

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
