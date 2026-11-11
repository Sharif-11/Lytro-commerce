# Photo designs plan: a product's photos are its designs

Status: agreed 2026-11-12, built after Phase 8's close-out (#348) and before Phase 9's code slices. PD-1 to PD-12 were
settled with the owner that day, and PD-21 and PD-25 to PD-27 from the owner's review of the screens. PD-13 to PD-20 and
PD-22 to PD-24 follow from them or from existing requirements, and are raised with this plan, so the owner can overrule
any of them.

**The storefront keeps its built design** (the owner, 2026-11-12: "the current design is ok, for landing page and product
detail page"). Only the changes named in §2 are made, and they are drawn in the storefront's own prototype,
`docs/brand/lytro-storefront.html`: the screens `product-photos`, `product-photos-chosen`, `product-photos-nudge`, `landing-photos` and `cart`.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice.

---

## 1. Goal and exit criteria

**Goal.** A seller of burkas, three-pieces or sarees lists one product in many designs by uploading its photos: each
photo is a design the shopper picks from the product's own photos, and with a size it names exactly one variant. **The
shopper gets exactly the design they chose, and the seller sends exactly that design: no mismatch.**

**What exists today** (`main` at 8fe0067a):
- A product's photos and its variants are separate. A variant has no photo of its own (ATR-05's "its own image" was
  never built, `DATABASE-SCHEMA.md` §2).
- Every order line, cart line and feed row uses the product's first photo
  (`product.service.ts` `orderableWithin`, `product-view.tsx`, `catalog-feed-csv.ts`).
- An option's swatch (ATR-18) is shop-wide, so it can't carry one product's own designs.
- The dashboard deletes a photo that no product uses, even if past orders show it (MED-09 only warns).
- SKUs are always typed by hand.
- The order confirmation page lists no items, and tracking shows no photo.
- The cart's remove control is a small grey "সরান" text button.
- A counted product's quantity shows no unit; only measured ones do.
- On desktop the product photo is taller than a laptop's window.

**Done when all of these hold:**
1. **Every rule in §2 has a passing test,** including one per no-mismatch rule (PD-4 to PD-9).
2. **The golden path passes as one test:**
   - A seller uploads 5 photos and gets 5 designs, groups two of them into one, and adds sizes 50 to 56.
   - A shopper taps the second design's photo card and picks 54. The cart, checkout, the confirmation, the seller's order
     page, the order editor and the parcel label all show that design's photo (the seller's also its name), 54 and
     1 piece.
   - The seller then deletes, reorders and regroups the product's photos, and the order still shows the same photo.
3. **The storefront looks as built** except for the changes in §2, as `lytro-storefront.html` draws them, at 390, 820
   and 1280, in Bangla and English.
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
| PD-4 | **How the shopper chooses** (no mismatch; the owner, 2026-11-12: "the customer should choose from the square shape photos ... the selecting logic is same as the design i rejected earlier"). | **Photo cards** in the option row, one per design (its cover), 4:5 like the product's photos, five filling the row and more scrolling sideways. **No label, number or word "ডিজাইন"** (the owner: "you need not guide the shopper"). **A tap chooses** a card (a ring and a tick) and the gallery shows that cover. **Nothing is chosen when the page opens** (the owner chose this over the first card chosen); tapping Add to cart, Buy now or Order before choosing scrolls to the cards, which shake once, and the buttons keep their words. Swiping the photos never chooses. |
| PD-5 | **The storefront's photos.** | **Every photo, one after another, as today, with nothing added on them.** |
| PD-6 | **What the shopper sees after choosing.** | Wherever an item is listed (the cart, checkout, the landing page's summary, the confirmation and tracking), **the chosen design's cover, with the size and quantity.** The shopper's screens never name the design: the photo says which it is. |
| PD-7 | **What the order keeps.** | The order line keeps the variant and the **cover of the chosen design**. Deleting, reordering or regrouping the product's photos later, or renaming the design, never changes a past order's photo. |
| PD-8 | **A photo that an order shows.** | **Kept as long as any order line shows it,** and it counts toward the shop's storage. Removing it from the product is allowed; deleting the file is refused while orders use it, with how many (amends MED-09, ORD-46, ORD-47). |
| PD-9 | **What the seller acts on.** | The order page, the order editor and the confirmation call show the cover with the design's name and the size. **The parcel label (ORD-19) names the design, the size and the SKU** on each item line. There is no separate packing list. |
| PD-10 | **SKUs.** | A variant of a product with designs that has no SKU gets one when saved: the product's initials, the design and the other values, e.g. `IB-D2-54`, made unique in the shop. The seller can change it. |
| PD-11 | **Products that exist today.** | They keep their photos as plain photos, and their variants and stock unchanged. PD-3's default applies to photos added later, **except** that a product which already has variants with stock or orders and no designs keeps new photos plain until the seller turns designs on (re-keying its variants is refused after orders, ATR-15). |
| PD-12 | **One design.** | A product with only one design shows no photo cards; that design is chosen. |

**PD-13 to PD-27 follow from those, from existing requirements, or from the owner's review of the screens.**

| # | Decision | Decided |
|---|---|---|
| PD-13 | **The data.** | One platform attribute, "ডিজাইন" / "Design", of a new data type `design`: variant-defining only, never informational or captured, never in the shop's attribute list. Its options belong to one product (`attribute_options.product_id`). A product photo names its design (`product_images.design_option_id`, null for a plain photo), so a design's photos are that product's photos with its option, in photo order. |
| PD-14 | **Design names, for the seller only.** | A design is "ডিজাইন 1, 2, 3…" by its order among the product's designs, unless the seller names it ("স্ট্রাইপ"); the number never changes once an order names it. The name shows on the seller's screens, the parcel label and the SKU, never to the shopper (PD-4, PD-6). |
| PD-15 | **Limits.** | The design attribute counts as one of ATR-14's 3 variant-defining attributes and toward its 100 variants; a product has at most 50 photos (PRD-11), so at most 50 designs. |
| PD-16 | **Saving.** | One request sets a product's photos and designs together (which photos, their order, their designs and names), and returns each design's option id, before its variants are saved. Option ids never change while a design keeps a photo, so its variants and stock stay. |
| PD-17 | **A sold-out design.** | Its card is greyed with "শেষ" and can't be chosen (ATR-07). |
| PD-18 | **Desktop.** | On the product page and the landing page, the photo is sized to the window's height (4:5, at most 800 px tall), so the whole photo is seen beside the name, the price and the choices without scrolling. The rest of each page is as built. |
| PD-19 | **Units.** | The quantity shows its unit for counted units as well ("1 পিস", "2 ডজন"), as it already does for measured ones. |
| PD-20 | **The size chart.** | Unchanged: the "সাইজ চার্ট" link opens it, as built; it is never one of the photos. |
| PD-21 | **The cart** (the owner, 2026-11-12: the built cart is good, "except the trash icon and unit and choosen image"). | **Kept exactly as built**, with three changes: the line shows the chosen design's cover; the quantity shows its unit; and a trash button (34 px, as tall as the quantity box, named "সরান") replaces the "সরান" text, beside the quantity. Removing a line shows "কার্ট থেকে সরানো হলো" with "ফিরিয়ে আনুন" (undo) for 5 seconds, in the built toast's style. |
| PD-22 | **Orders not tapped by a shopper.** | The order editor and a combo's choice picker offer a product's variants by design cover and size, never by text alone; an order can't be saved with a design-product line that has no design. |
| PD-23 | **The feed** (FED-02). | A variant row's `image_link` is its design's cover, and `additional_image_link` the design's other photos, then the product's plain photos. |
| PD-24 | **A shared link** (LND-06). | `?v=<variant>` opens with that variant's design and size chosen, and the gallery on its cover. |
| PD-25 | **The delivery charge before the address is known** (the owner, 2026-11-12: "when there is no choosen address you should render the maximum one"). | The cart and the landing page's form show **the shop's highest delivery charge** and **one total**, not a range, with the link "সঠিক ডেলিভারি চার্জ জানতে আপনার অ্যাড্রেস দিন" (the landing form: "সঠিক ডেলিভারি চার্জ জানতে থানা বাছুন"); once the address or thana is known, the exact charge (SFT-20). Amends SFT-20 and LND-07's "a range until the thana is chosen". |
| PD-26 | **Asking for the shopper's address** (the owner, 2026-11-12: "elaka => address", then "sothik delivery charge janthe apnar address din"). | The prompts that ask for the address to work out the delivery charge say **"অ্যাড্রেস"**. In the built storefront's words (`apps/storefront/src/lib/i18n/copy.ts`): `deliv_area` becomes "আপনার অ্যাড্রেস দিন" / "Set your address", `area_title` "আপনার অ্যাড্রেস" / "Your address", and `area_save` "অ্যাড্রেস ঠিক করুন" / "Set address". The address form's own fields ("পুরো ঠিকানা", "ডেলিভারি ঠিকানা", saved addresses) keep their built words. |
| PD-27 | **No redesign** (the owner, 2026-11-12). | The product page, the landing page and the cart keep their built look. From a redesign drawn on 2026-11-12, only the photo cards and their choosing (PD-4) are kept; its numbers, "ডিজাইন" labels, "এই ডিজাইন নিন" buttons on the photos, guiding button words and new layout were turned down and are not built. |

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
| SFT-04, LND-01 | The photo cards, nothing chosen until tapped, the gallery showing a tapped design's cover, and the photo sized to the window on desktop (PD-4, PD-17, PD-18). |
| SFT-05 | The cart line's design cover, its unit and its trash button (PD-6, PD-19, PD-21). |
| SFT-20, LND-07 | The highest charge and one total before the address is known; "অ্যাড্রেস" (PD-25, PD-26). |
| ORD-17, ORD-19 | The confirmation page and tracking list items with photos; the label names design, size and SKU (PD-6, PD-9). |
| ORD-46, ORD-47, MED-09 | A photo an order shows is kept, not best effort (PD-8). |
| UOM-05 (new) | The unit on every quantity (PD-19). |
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
3. **The storefront.** The built pages with only §2's changes (PD-4 to PD-6, PD-12, PD-17 to PD-21, PD-24 to PD-26),
   as `lytro-storefront.html` draws them.

**Tests** prove each PD row against its words, with a sabotage pass on PD-7 and PD-8 (an order's photo must survive
every edit) and on PD-4 (an order always carries the design that was chosen). Each PR runs the checks in
`ENGINEERING-STANDARDS.md` §7 and a real boot of the built server.
