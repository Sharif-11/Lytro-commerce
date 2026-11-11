# Photo designs plan: a product's photos are its designs

Status: agreed 2026-11-12, built after Phase 8's close-out (#348) and before Phase 9's code slices. PD-1 to PD-12 were
settled with the owner that day. PD-13 to PD-24 follow from them or from existing requirements, and are raised with this
plan, so the owner can overrule any of them. The sketch is `docs/brand/lytro-product-v2.html`.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice.

---

## 1. Goal and exit criteria

**Goal.** A seller of burkas, three-pieces or sarees lists one product in many designs by uploading its photos: each
photo is a design the shopper picks by tapping it, and with a size it names exactly one variant. **The shopper gets
exactly the design they chose, and the seller sends exactly that design: no mismatch.**

**What exists today** (`main` at 8fe0067a):
- A product's photos and its variants are separate. A variant has no photo of its own (ATR-05's "its own image" was
  never built, `DATABASE-SCHEMA.md` §2).
- Every order line, cart line and feed row uses the product's first photo
  (`product.service.ts` `orderableWithin`, `product-view.tsx`, `catalog-feed-csv.ts`).
- An option's swatch (ATR-18) is shop-wide and small, so it can't carry a product's own designs.
- The dashboard deletes a photo that no product uses, even if past orders show it (MED-09 only warns).
- SKUs are always typed by hand.
- The order confirmation page lists no items, and tracking shows no photo.
- The cart's remove control is a small grey "সরান" text button.
- A counted product's quantity shows no unit; only measured ones do.

**Done when all of these hold:**
1. **Every rule in §2 has a passing test,** including one per no-mismatch rule (PD-4 to PD-9).
2. **The golden path passes as one test:**
   - A seller uploads 5 photos and gets 5 designs, groups two of them into one, and adds sizes 50 to 56.
   - A shopper taps a photo of design 2 and picks 54. The cart, checkout, confirmation, the seller's order page, the
     order editor and the parcel label all show design 2, size 54, 1 piece.
   - The seller then deletes, reorders and regroups the product's photos, and the order still shows the same photo.
3. **The sketch is matched pixel for pixel** at 390, 820 and 1280, in Bangla and English, except for named deviations.
4. **Nothing already on sale changes:** an existing product keeps its variants, stock and photos as they were (PD-11).
5. CI is green, and the pull-request flow is used.

---

## 2. Decisions

**PD-1 to PD-12 agreed 2026-11-12** (the owner's read).

| # | Decision | Decided |
|---|---|---|
| PD-1 | **What a design is.** | **A product's own photo is a choice:** the seller uploads photos and each one becomes a design. Under the hood a design is an ordinary variant-defining option, so a design × a size is one variant, with its own stock, price and SKU, and orders, stock, combos and the feed work as they do for any variant. |
| PD-2 | **Several photos of one design** (front, back, a close-up). | One design holds one or more photos; its **first photo is its cover.** The seller groups photos with "এই ডিজাইনের আরেকটি ছবি" ("Same design, another angle"). |
| PD-3 | **A new photo's default.** | **Every newly added photo is a design, on every product,** until the seller switches it off ("এটি ডিজাইন নয়", a plain photo). The owner chose this over a per-product switch for fashion shops and over a warning on save. |
| PD-4 | **How the shopper chooses** (no mismatch). | **A deliberate tap only:** a photo's "এই ডিজাইন নিন" button, or a card in the design row. Swiping through photos never chooses. With 2 or more designs nothing is chosen at first, and the buy button reads "ডিজাইন বাছুন", then "সাইজ বাছুন", until both are chosen; tapping it early scrolls to what is missing. |
| PD-5 | **The storefront's photos.** | **Every photo, one after another, as today.** Each photo of a design is labelled "ডিজাইন 2 · ছবি 1/2" and carries the button; a plain photo carries neither. A design row under the price shows each design once, by its cover. |
| PD-6 | **What the shopper sees after choosing.** | **The chosen design's cover, with the size and quantity**, in the buy bar, the cart, checkout, the landing page's "আপনার বাছাই", the confirmation page and tracking. **The shopper's screens never name the design in words: the photo says which it is** (the owner, 2026-11-12). Only the seller's screens and the parcel label name it. |
| PD-7 | **What the order keeps.** | The order line keeps the variant and the **cover of the chosen design**, whichever of that design's photos the shopper tapped. Deleting, reordering or regrouping the product's photos later, or renaming the design, never changes a past order's photo. |
| PD-8 | **A photo that an order shows.** | **Kept as long as any order line shows it,** and it counts toward the shop's storage. Removing it from the product is allowed; deleting the file is refused while orders use it, with how many (amends MED-09, ORD-46, ORD-47). |
| PD-9 | **What the seller acts on.** | The order page, the order editor and the confirmation call show the cover with the design and size. **The parcel label (ORD-19) names the design, the size and the SKU** on each item line. There is no separate packing list. |
| PD-10 | **SKUs.** | A variant of a product with designs that has no SKU gets one when saved: the product's initials, the design and the other values, e.g. `IB-D2-54`, made unique in the shop. The seller can change it. |
| PD-11 | **Products that exist today.** | They keep their photos as plain photos, and their variants and stock unchanged. PD-3's default applies to photos added later, **except** that a product which already has variants with stock or orders and no designs keeps new photos plain until the seller turns designs on (re-keying its variants is refused after orders, ATR-15). |
| PD-12 | **One design.** | A product with only one design shows no design row and no "choose" buttons; that design is chosen. |

**PD-13 to PD-24 follow from those, from the sketch, or from the owner's review of it.**

| # | Decision | Decided |
|---|---|---|
| PD-13 | **The data.** | One platform attribute, "ডিজাইন" / "Design", of a new data type `design`: variant-defining only, never informational or captured, never in the shop's attribute list. Its options belong to one product (`attribute_options.product_id`). A product photo names its design (`product_images.design_option_id`, null for a plain photo), so a design's photos are that product's photos with its option, in photo order. |
| PD-14 | **Design names, for the seller.** | A design is "ডিজাইন 1, 2, 3…" by its order among the product's designs, unless the seller names it ("স্ট্রাইপ"); the number never changes once an order names it. The name shows on the seller's screens, the parcel label and the SKU, never to the shopper (PD-6). The storefront's photos and design cards carry only the design's number, so a shopper can see which photos belong together. |
| PD-15 | **Limits.** | The design attribute counts as one of ATR-14's 3 variant-defining attributes and toward its 100 variants; a product has at most 50 photos (PRD-11), so at most 50 designs. |
| PD-16 | **Saving.** | One request sets a product's photos and designs together (which photos, their order, their designs and names), and returns each design's option id, before its variants are saved. Option ids never change while a design keeps a photo, so its variants and stock stay. |
| PD-17 | **A sold-out design.** | Its card is greyed with "শেষ", its photos' button says "এই ডিজাইন শেষ", and it can't be chosen; a size sold out only in the chosen design is struck through, and a sentence says other designs have it. |
| PD-18 | **Desktop.** | The photo is sized to the window's height (4:5, at most 800 px tall) beside the info column, so the photo, the name, the price and the design row are seen without scrolling. The landing page puts the details and then the order form in the right-hand column. |
| PD-19 | **Units.** | Every quantity shows its unit, counted ones included ("1 পিস", "2 ডজন", "0.5 কেজি"), and the price says what it is per ("৳3,500 / পিস"); a measured product offers quick picks (250 গ্রাম, 500 গ্রাম, 1 কেজি, 2 কেজি). |
| PD-20 | **The size chart.** | Unchanged: the "সাইজ চার্ট" link opens it in a sheet, with the chosen size highlighted; it is never one of the photos. |
| PD-21 | **The cart.** | **Kept exactly as built** (the owner, 2026-11-12: the built cart is good), with three changes only: the line shows the chosen design's cover; the quantity shows its unit ("1 পিস"); and a trash button (34 px, as tall as the quantity box, named "সরান") replaces the "সরান" text, beside the quantity. Removing a line shows "কার্ট থেকে সরানো হলো" with "ফিরিয়ে আনুন" (undo) for 5 seconds, in the built toast's style. |
| PD-25 | **The delivery charge before the area is known** (the owner, 2026-11-12: "when there is no choosen address you should render the maximum one"). | The cart and the landing page's form show **the shop's highest delivery charge** and **one total**, not a range, with the link "সঠিক ডেলিভারি চার্জ জানতে আপনার ঠিকানা দিন" (the landing form: "সঠিক ডেলিভারি চার্জ জানতে থানা বাছুন"); once the area or thana is known, the exact charge (SFT-20). Amends SFT-20 and LND-07's "a range until the thana is chosen". |
| PD-26 | **Asking for the shopper's address** (the owner, 2026-11-12: "elaka => address", then "sothik delivery charge janthe apnar address din"). | The prompts that ask for the address to work out the delivery charge say **"অ্যাড্রেস"**: "সঠিক ডেলিভারি চার্জ জানতে আপনার অ্যাড্রেস দিন" in the cart, "অ্যাড্রেস দিন" on the product page. In the built storefront's words (`apps/storefront/src/lib/i18n/copy.ts`): `deliv_area` becomes "আপনার অ্যাড্রেস দিন" / "Set your address", `area_title` "আপনার অ্যাড্রেস" / "Your address", and `area_save` "অ্যাড্রেস ঠিক করুন" / "Set address". The address form's own fields ("পুরো ঠিকানা", "ডেলিভারি ঠিকানা", saved addresses) keep their built words. |
| PD-22 | **Orders not tapped by a shopper.** | The order editor and a combo's choice picker offer a product's variants by design cover and size, never by text alone; an order can't be saved with a design-product line that has no design. |
| PD-23 | **The feed** (FED-02). | A variant row's `image_link` is its design's cover, and `additional_image_link` the design's other photos, then the product's plain photos. |
| PD-24 | **A shared link** (LND-06). | `?v=<variant>` opens with that variant's design and size chosen, and the gallery on its cover. |

---

## 3. Requirement changes (`SRS-detailed.md`)

Amended in the docs commit of this work, with the date 2026-11-12:

| Row | Change |
|---|---|
| ATR-05 | A variant of a product with designs shows its design's cover as its own image (PD-1, PD-2). |
| ATR-14 | The design attribute counts toward the 3 and the 100 (PD-15). |
| ATR-19 (new) | Photo designs: PD-1 to PD-5, PD-12 to PD-14, PD-16, PD-17. |
| ATR-20 (new) | The no-mismatch rule: PD-4, PD-6, PD-7, PD-9, PD-22, PD-24. |
| PRD-11 | A photo is a design by default (PD-3, PD-11). |
| SFT-04, LND-01, LND-07 | The design row, the photo buttons, the buy bar's states (PD-4 to PD-6, PD-17, PD-18). |
| SFT-05 | The cart line's design cover and its trash button (PD-6, PD-21). |
| ORD-17, ORD-19 | The confirmation page and tracking list items with photos; the label names design, size and SKU (PD-6, PD-9). |
| ORD-46, ORD-47, MED-09 | A photo an order shows is kept, not best effort (PD-8). |
| UOM-05 (new) | Units on every quantity and price, and quick picks (PD-19). |
| FED-02 | The design cover as `image_link` (PD-23). |
| SKU (ATR-05) | Filled when empty for products with designs (PD-10). |

---

## 4. Build

Three pull requests, each from `main`, server first and screens last (as every phase does):

1. **The server.** Migration (PD-13: the `design` data type and the platform attribute, `attribute_options.product_id`,
   `product_images.design_option_id`, an index on order lines' photos), the photo-and-design save (PD-16), variants and
   limits (PD-15), the order line's cover (PD-7), keeping ordered photos (PD-8), SKUs (PD-10), the public product's
   designs, the label's item line (PD-9), tracking's and the confirmation's items (PD-6), the feed (PD-23).
2. **The dashboard.** The photo sheet's designs (PD-2, PD-3, PD-11, PD-14), the variants card showing designs as photos,
   the order editor's and combo editor's picker by photo (PD-22), the order page's cover and SKU, the label. Sketched
   first in `lytro-dashboard.html`.
3. **The storefront.** The sketch: the product page, the landing page, the cart (PD-21), checkout, the confirmation,
   tracking and units (PD-19).

**Tests** prove each PD row against its words, with a sabotage pass on PD-7 and PD-8 (an order's photo must survive
every edit) and on PD-4 (no order without a deliberate choice). Each PR runs the checks in `ENGINEERING-STANDARDS.md` §7
and a real boot of the built server.
