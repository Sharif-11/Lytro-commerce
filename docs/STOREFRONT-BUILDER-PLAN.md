# Storefront builder plan: every shop its own look

Status: designed 2026-11-18 and being built (the owner the same day: "you can start theme building task. phase 9 is too
length don't wait", SB-3). SB-1 to SB-6 were settled with the owner that day, and the sketch was approved ("its ok").
SB-7 to SB-20 follow from them, from existing requirements or from the sketch, and are raised with this plan so the
owner can overrule any of them. SB-21 is the owner's answer during the build; SB-22 to SB-29 are my calls made while
building the server, listed so they can be overruled.

**The sketch is the build target:** `docs/brand/lytro-storefront-builder.html`. It has five themes, each drawn as a sample
shop (`royal`, `fresh`, `bold`, `soft`, `studio`), and the dashboard's editor screens (`e-home`, `e-themes`, `e-brand`,
`e-hero`, `e-slide`, `e-products`, `e-add`, `e-publish`), on a phone and on a desktop, in Bangla and English.
Screens are built pixel-perfect to it, as every surface is.

Reopening a decision in §2 needs an explicit change to its row, not a silent deviation during a slice.

---

## 1. Goal and exit criteria

**Goal.** Every shop's storefront looks like its kind of business, a perfume house unlike a biryani kitchen, and the
seller sets it up from a phone in minutes, with no code. **A new shop looks finished on its first day without the
seller touching anything,** because every section fills itself from the shop's own data.

**What exists today** (`main` at a0f02e18):
- **One fixed layout for every shop** (SFT-01). The brand identity add-on changes colours, fonts, corners and spacing
  only, and never the layout (BRN-02, BRN-04).
- **The home page** (`apps/storefront/src/components/home/home-view.tsx`):
  - a text greeting with the shop's name and no photo;
  - the trust strip;
  - Shop by category;
  - New arrivals;
  - the install card.
- **The logo** is set in Shop details. **The square icon** is part of the paid add-on (BRN-02). **The app's icon** is
  the brand icon if set, otherwise the logo, otherwise the monogram (`apps/storefront/src/lib/app/app-icons.ts`).
- **Shop pages are kept at Cloudflare's edge and purged by tag** (D9-32, Slice 9.10).
- **The competition.** Bonik AI (bonikai.shop, studied 2026-11-18) has no themes either: one layout and one accent colour
  per shop. Its shops still look alive because every block fills itself from the shop's data:
  - a hero built from discounted products;
  - two offer tiles;
  - an offers line;
  - delivery fees;
  - "১২ বার অর্ডার হয়েছে" and "মাত্র ৩টি বাকি" badges.

**Done when all of these hold:**
1. **Every rule in §2 has a passing test.**
2. **The golden path passes as one test:**
   - A new perfume shop opens on the Royal theme, already filled: the offers line, a hero from its discounts, its
     categories, its best sellers, the trust strip.
   - On a phone, its owner switches to Studio, turns testimonials off, moves "On sale" above "Just in", adds two hero
     slides of their own with a focal point, uploads a logo and an icon, and publishes.
   - Within a minute a shopper sees the new home page, and the browser tab and the installed app show the icon.
   - "Back to the previous design" restores the Royal page.
3. **The five themes look as the sketch draws them,** at 390, 820 and 1280 wide, in Bangla and English, with every theme
   colour set passing BRN-03's contrast.
4. **Pages stay as fast as now.**
   - The published design travels with the shop data the storefront already reads, so it adds no extra call.
   - A design the shopper sees is kept at the edge like any other page.
   - The draft is never cached and never public.
5. CI is green, and the pull-request flow is used.

---

## 2. Decisions

**SB-1 to SB-6 agreed 2026-11-18** (the owner's read and review).

| # | Decision | Decided |
|---|---|---|
| SB-1 | **How much a shop can change.** | **Themes + sections**: pick a theme, then show, hide, reorder and fill the home page's sections, with a live preview, a draft and Publish. **No free drag-and-drop and no custom HTML, CSS or code.** |
| SB-2 | **Who gets it.** | **Every plan**, free (the storefront is on every plan, SFT-17). Colours and fonts of the shop's own beyond a theme's colour sets stay the **brand identity add-on** (BRN-05). |
| SB-3 | **When.** | ~~Designed now, built after Phase 9.~~ **Amended 2026-11-18 (the owner: "phase 9 is too length don't wait"): built now,** alongside Phase 9, as its own work like the photo designs. |
| SB-4 | **New features.** | **None in the first version:** only what Lytro already knows (products, categories, sale prices, sales figures, delivery fees, payment methods, the seller's own text and photos). **Amended 2026-11-18:** Lytro had no sale price, so the regular price is added (SB-21). Ratings and reviews, a newsletter, a wishlist and YouTube, TikTok and Instagram links come later, each as its own feature. |
| SB-5 | **Logo and icon** (the owner: "everyone can upload icon for website and app"). | **Every plan uploads its own icon,** one square image for the website (the browser tab) and the installed app (the phone's home screen), next to the logo, each with a live preview. With no icon it is made from the logo; with no logo, from the monogram (today's rule, `app-icons.ts`). |
| SB-6 | **Mobile first** (the owner: "all customer use mobile most of the time"). | **The phone is the design;** wider screens only add room: columns, side-by-side banners, the search bar. |

**SB-7 to SB-20 follow from SB-1 to SB-6 or from the sketch.**

| # | Decision | Decided |
|---|---|---|
| SB-7 | **The themes.** | **Five**, as sketched: **Royal** (perfume, jewellery), **Fresh** (food, grocery), **Bold** (gadgets, general stores), **Soft** (beauty, women's fashion), **Studio** (fashion). A theme is design tokens plus a default variant of each section:<br>• **Tokens:** colours, a heading and a body pair from `BRAND_FONTS`, corners.<br>• **Section variants:** a centred or bar header; an overlay, split or slide-plus-two-tiles hero; square, circle, tall or pill categories; framed, rounded, plain or photo product cards; the section heading's style.<br>Each theme has **three free colour sets**. |
| SB-8 | **The sections** (first version). | **Can be added, removed and repeated:**<br>• an announcement line;<br>• hero slides;<br>• categories;<br>• a product row;<br>• offer banners (one or two);<br>• a wide banner;<br>• a trust strip;<br>• testimonials;<br>• About the shop.<br>**Fixed, never removed:** the header (logo, menu, search, cart) and the footer (contact, social links, Powered by Lytro, TEN-18).<br>**Limits:**<br>• 12 sections;<br>• a hero of up to 3 slides;<br>• a product row of 4 to 12 products;<br>• 1 or 2 offer banners;<br>• up to 6 testimonials;<br>• up to 12 hand-picked products.<br>Every text field has a longest length (SEC-12); a headline is at most 60 characters. |
| SB-9 | **Sections fill themselves** (Bonik AI's lesson). | Until the seller writes their own, each section is filled from the shop's data:<br>• **Announcement:** "N পণ্যে X% পর্যন্ত ছাড়" from the products on sale, and the Dhaka delivery fee.<br>• **Hero:** the three biggest discounts, each with its own photo; a slide leaves when its offer ends.<br>• **Categories:** every top-level category with its picture, or else its first product's photo, and its product count.<br>• **Trust strip:** cash on delivery, the delivery fees from the shop's zones, its payment methods, order tracking.<br>• **Product rows:** **newest** first; **on sale** with the biggest discount first; **best sellers** from the last 30 days of delivered orders (Slice 4.7's figures); one category; or hand-picked. Sold-out products leave a row. |
| SB-10 | **Badges.** | Set by the data, never typed:<br>• the discount (−X%);<br>• **New** for 14 days after a product is added;<br>• **Best seller** for a shop's top sellers;<br>• **Only N left** under the product's low-stock level;<br>• **Ordered N times** from its delivered orders. |
| SB-11 | **Where a shop starts.** | A new shop starts on **its shop type's theme** with every section on auto:<br>• fashion → Studio;<br>• cosmetics → Soft;<br>• food and grocery → Fresh;<br>• gadgets and general stores → Bold;<br>• perfume and jewellery → Royal.<br>**As built** (`STARTING_THEME`, against the shop types Lytro has): clothing and shoes & bags → Studio; cosmetics → Soft; grocery, food & bakery and pharmacy → Fresh; electronics, mobiles & gadgets, books & stationery and other → Bold; home décor → Royal; a shop with no type, or a type added later, → Bold. There is no perfume or jewellery type yet; such a shop picks Royal.<br>So it looks finished with no setup. **Before launch the only shops are tenant #1 (DAT-16) and staging's test shops, so every shop moves to its type's theme the same way;** today's home page is not kept as a sixth theme. This is my call; the owner can overrule it, at the cost of one more theme. |
| SB-12 | **Draft, preview and publish.** | Edits save to a **draft on the server**, so a phone and a desktop see the same draft. This differs from the brand editor's "edits stay on the page until Save" (11.2 point 2), because a home page takes longer than one sitting.<br>• **Preview:** the real storefront drawn from the draft through a short-lived signed link, never cached and never public. On a desktop it sits beside the editor; on a phone it opens full screen.<br>• **Publish:** makes the draft live and purges the shop's pages from the edge by tag (D9-32), so shoppers see it within a minute.<br>• **Back:** the previous published design is kept, and "Back to the previous design" is one tap. |
| SB-13 | **Who may edit.** | `settings:manage`, as the brand editor. Each publish and revert is in the shop's activity log (AUD-01). |
| SB-14 | **Storage.** | **One validated document per shop:** its theme, colour set and sections with their settings.<br>• **Three copies:** draft, published, previous.<br>• **One schema** in `packages/validators`, read by the server, the storefront and the dashboard. The Zod 4 walker guards apply.<br>• **Photos** are referred to by media ID, and media uses count them. **As built:** they are uploaded as the shop's logo images are (the `shop_logo` purpose), not under a purpose of their own: a new value of the media purpose type would break the previous release while two run side by side (Slice 9.7's old-release check), and the purpose decides nothing for them.<br>• **The published copy** goes out with `/v1/shop`. |
| SB-15 | **Photos.** | Uploaded through the existing media pipeline. A banner or slide photo is at least 1200 px wide and stores a **focal point**: a phone keeps a square around it, a desktop a 1280 × 560 band. |
| SB-16 | **Where a button goes.** | To on sale, just in, best sellers, a category or a product, chosen from a list, never typed. A target that is deleted falls back to the home page, and the editor says which section points at it. |
| SB-17 | **Every other page.** | Only the home page has sections in this version. The category, search, product, cart and checkout pages take the theme's **tokens and product card**; their layout is as built. The payment page never changes beyond the shop's name and logo (PAY-05). |
| SB-18 | **The brand identity add-on with a theme.** | With "Use my brand" on, the identity's colours, fonts, corners and spacing replace the theme's tokens. The layout (the sections and their variants) stays the theme's. |
| SB-19 | **Contrast.** | Every theme colour set passes BRN-03 (4.5:1 body text, 3:1 large text); a test checks them all. Text over a photo always sits on the section's shade. |
| SB-20 | **What a theme never changes.** | The fixed status colours, Powered by Lytro and Secured by Lytro (TEN-18), the floating chat button (SFT-21's contacts), cash on delivery's wording, and the order and payment flows. |


**SB-21 agreed 2026-11-18** (the owner chose "Add a regular price (Recommended)" during the build).

| # | Decision | Decided |
|---|---|---|
| SB-21 | **The regular price** ("আগের দাম"). Lytro had no sale price, and SB-9's "on sale" and SB-10's "−X%" need one. | **A product has an optional regular price, and a variant may override it as it overrides the price.** It is at least the price (equal is simply not on sale). A product whose price saves at least 1% against it is **on sale**: the storefront strikes the regular price through, shows the saving as a whole percent rounded down, lists it in "On sale" and the offers line, and the hero fills itself from it. **Orders charge the price, never the regular price.** Raising the price past the regular price ends the sale without an error. |

**SB-22 to SB-29: my calls while building the server (2026-11-18)**, each open to the owner's overrule.

| # | Decision | Decided |
|---|---|---|
| SB-22 | **Best seller badge.** | A shop's **5** most sold products by units over the last 30 days of delivered orders (Slice 4.7's counted orders); a product with no sale is never one. |
| SB-23 | **"Ordered N times".** | The delivered orders that ever held the product (not only 30 days), so a long seller is not undersold. |
| SB-24 | **"Only N left".** | Only while the product is under its low-stock level (its stock state "low"), and only for whole units of stock of its own: never a weighed product's, a shared stock's or a combo's. PRD-09 is amended to allow it. |
| SB-25 | **Going back.** | "Back" swaps the live design and the one before, so a second tap undoes the first. It drops an unpublished draft; the editor warns first. |
| SB-26 | **Preview link.** | Signed by the server, valid **30 minutes**, for that shop only; `/v1/shop?preview=` answers with `Cache-Control: no-store`; an ended or changed link is refused, never quietly shown the live design. |
| SB-27 | **The icon and the brand identity.** | The icon is kept in Shop details for every plan (SB-5). An icon saved through the brand editor before this release still shows until another is set; from now the brand editor and Shop details set the one icon together. |
| SB-28 | **Missing pieces.** | A design's photo or target deleted later is left out where it shows (a slide or banner without its photo is dropped; a button to a deleted category goes home), its pages leave the edge, and the editor lists the sections it touched (`broken`). Saving refuses a photo, category or product the shop doesn't have. |
| SB-29 | **Picked rows and category tiles.** | The public product list takes `productIds` (up to 12, in the seller's order) for a picked row; a category without a picture of its own is covered by its first product's first photo. |

---

## 3. Requirement changes (`SRS-detailed.md`)

Amended in the first pull request of the build, dated that day.

| Row | Change |
|---|---|
| SFT-01 | One shared application whose home page is the shop's theme and sections (SB-1, SB-7, SB-8, SB-17), no longer one fixed layout. |
| BRN-04 | The identity still never changes a layout; the theme does (SB-18). |
| BRN-02, BRN-05 | The square icon leaves the add-on: every plan sets it (SB-5). |
| SFT-13, SFT-14 | The tab icon and the installed app's icon are the shop's icon, then its logo, then its monogram (SB-5). |
| BRN-06 | The live preview covers the builder's draft (SB-12). |
| SFT-22 (new) | Themes, colour sets and where a shop starts: SB-7, SB-11. |
| SFT-23 (new) | Sections, their limits and their auto content: SB-8 to SB-10, SB-16. |
| SFT-24 (new) | Draft, preview, publish and going back: SB-12, SB-13. |
| PRD-09 | The public list may order by saving and by best selling, filter to products on sale or named, and give each card its badges' facts, "only N left" among them (SB-9, SB-10, SB-24). |
| PRD-19 (new) | The regular price (SB-21). |

Done in the server's pull request (2026-11-18).

---

## 4. Build

Three pull requests, each from `main`. The server goes first and the screens follow, as every phase does. **Amended
2026-11-18 (the owner chose "Two PRs (Recommended)"): the storefront is two pull requests, so four in all** -- 2a the
home page (themes, the sections filling themselves, the draft's preview), then 2b the rest of the shop (the theme's
header, footer and product card on every page, the badges and the struck regular price on the lists and the product
page, the shop's icon). The server's merged as #388.

1. **The server.**
   - **Migration:** the shop's design document (draft, published, previous), the shop's icon and the regular price (0143; no new media purpose, SB-14).
   - **Schema:** the design document's schema in validators.
   - **API:** read and save the draft, publish (with the edge purge by tag), go back, and the signed preview link.
   - **Public reads:** the published design on `/v1/shop`, and the public catalogue's new orders, "biggest discount" and "best selling" (SB-9).
   - **Icon:** the upload for every plan (SB-5).
   - **Starting theme:** each shop's from its shop type (SB-11).
2. **The storefront.**
   - **Themes:** tokens and section variants.
   - **Sections:** the renderers and their auto content and badges.
   - **Preview:** the draft drawn through its signed link.
   - **Icons:** the tab icon and the app's icon from the shop's icon.
   - **Look:** pixel-perfect to the sketch's theme screens, phone first.

   **2a as built (the home page):**
   - The sketch's shop CSS is ported by script into `apps/storefront/src/app/storefront-design.css`, scoped under
     `.sfb` with every class named `sb-`, so it and the storefront's own rules never meet. The theme's tokens are its
     CSS variables; the shop's identity, while it shows, replaces its colours, fonts and corners (SB-18). Every other
     page's frame takes the theme's main colour and fonts (SB-17), until 2b gives it the theme's header and footer.
   - **The preview is its own address, `/preview?t=<token>`**, not `/?preview=`: Cloudflare's cache key ignores the
     query on `/` (DEPLOYMENT.md), so a cached home would answer it. It is `no-store`, a private edge mark, left by the
     service worker, never read through the storefront's shared one-minute shop read, and not indexed.
   - Buttons to "on sale" and "best sellers" lead to two new list pages, `/offers` and `/best`, kept at the edge as
     New arrivals is.
   - A server that sends no design (an older one, while two run side by side) gets the home as before.

   **2a's named deviations from the sketch:**
   - **Header and footer:** the storefront's own until 2b, in the theme's colour and fonts (2b gives the theme's).
   - **The card's button:** "এখনই কিনুন" (Buy now), opening the product's page: a card can't choose a size or colour,
     so it never adds to the cart itself.
   - **No heart on photo cards:** there is no wishlist in the first version (SB-4).
   - **Delivery** is the range of the shop's own zones' charges, as the home said before, not "in Dhaka": zones carry
     the shop's own names.
   - **Savings round down** (SB-21): Velvet gift box reads −13% where the sketch rounds to −14%.
   - **A hero's words have no emphasised part:** the design document's headline is plain text.
   - **A hero's dots** show only with more than one slide.
   - **One photo per slide or banner, with its focal point** (SB-15); the sketch drew separate phone and wide crops.
   - **Banners' shades** are each theme's two from the sketch (`ban-a`, `ban-b`), a first and a second banner in turn,
     not one per banner: a seller doesn't choose a shade.
   - **The wallets line** names up to two of the shop's wallets as checkout writes them ("bKash, Nagad দিয়ে
     পেমেন্ট").
   - **About the shop** was not drawn: its heading and text in the theme's own style, its photo beside them on a wide
     screen.
   - Test pictures: `e2e/design.spec.ts` shoots each theme beside the sketch, phone and desktop, both languages, into
     `test-results/compare/builder-*`.

   **2b as built (the rest of the shop):**
   - **Every page of a designed shop wears the theme's header and footer** (SB-8): the sketch's markup in the theme's
     style, with the storefront's own search, account, cart and language in their places. An announcement first on the
     home page sits over the header, as the sketch draws it.
   - **Every list draws the theme's card** (SB-17): a category, New arrivals, on sale, best sellers, search and the
     product page's "you may also like".
   - **The product page** strikes the regular price through beside the price, with its saving rounded down (SB-21),
     for the chosen variant or the product's lowest price.
   - **The shop's icon** changes the app's icon links at once (their version takes the icon), and the phone's bar and
     the installed app take the theme's colour where no brand identity shows (SB-5, SB-17).

   **2b's named deviations from the sketch:**
   - **An inner page** shows a way back in the menu's place, and no title in the header on a phone: the page's own
     heading says it.
   - **The menu** leads to the home's categories: there is no menu drawer in the first version.
   - **The cart** keeps the storefront's bag icon and its count.
   - **No line under the shop's name:** a shop has no tagline in Lytro.
   - **The footer's Shop list** has Best sellers in place of Just in (All products already leads to the newest), its
     Contact list the email too, and its base the language switch and Lytro's privacy policy (Part 99) beside the year.
   - **On a phone the footer keeps room under it** for a bar fixed at the bottom (a product's buy bar), as the page
     did.
3. **The dashboard.** Settings > Storefront > Design:
   - the section list;
   - the theme gallery;
   - logo and icon with their previews;
   - the hero, slide, product-row and add-section sheets;
   - the live preview and publish.

   Pixel-perfect to the sketch's `e-*` screens. **Amended 2026-11-18 (the owner chose "Two PRs (Recommended)"): the
   dashboard is two pull requests, so five in all** -- 3a the design page, the theme gallery, logo and icon, the
   preview, Publish and Back; then 3b each section's own sheet (the hero and its slides with their focal points, the
   product rows' pickers, the banners, the testimonials, About and the announcement's words).

   **3a as built:**
   - **The draft is the server's, saved whole on each change** (SB-12): a switch, an arrow, a colour set, an added or
     removed section each save at once, one save at a time and the newest last; a refused one puts the screen back.
     The preview draws the draft again after each save. Leaving while one is on its way asks first.
   - **The live preview frames the real storefront** at the shop's Lytro address, `/preview?t=<token>`, beside the
     editor from 1024 px (phone or desktop width, scaled to fit) and over the whole screen on a phone. **The owner's
     narrow exception to SEC-04 (2026-11-18, "Allow one narrow exception (Recommended)"):** Caddy lets only
     `app.<domain>` frame a shop's `/preview` (`frame-ancestors`, no `X-Frame-Options`), every other page of every host
     still refuses framing, and the dashboard's policy frames nothing but `https://*.<domain>`. A shop on its own domain
     previews at its Lytro address, which the storefront doesn't redirect for `/preview`. The link is asked for again
     before its 30 minutes end.
   - **Trying a theme never touches the draft:** the gallery shows it over the draft through the preview's
     `&theme=<key>`; "Use the … theme" puts it in the draft on its first colour set.
   - **Publish** lists what changes against what shoppers see now (the editor's read gained `live` for it): the theme,
     the colours, each section added, turned on or off, changed or removed, and a new order.
   - **Back to the previous design** and **Discard the draft** are links under the sections, each asked first.
   - **Logo and icon** upload at once and preview at once; nothing changes for shoppers until Save, and a picture
     never saved is deleted (MED-09). The icon is checked square and at least 512 px before it is sent.
   - The theme gallery's pictures are the sketch's own sample shops, captured once into
     `apps/dashboard/public/storefront-themes/<theme>-<language>.jpg`.

   **3a's named deviations from the sketch:**
   - **The dashboard's own parts:** its cards (10 px corners), buttons, switches, sheets and dialogs, and its page
     frame, header and bottom navigation, with the sketch's layout, order and words. Preview and Publish are the page's
     action bar: at the foot on a phone, above the page from 1024 px.
   - **The draft's chip** sits beside the title on a phone and beside the preview's heading from 1024 px, where the
     header carries the title.
   - **Add a section** offers the six kinds that fill themselves (hero, a row of products, categories, offer banners,
     the trust strip, the announcement); the wide banner, testimonials and About, which need the seller's own words or
     photos, come with their sheets in 3b. A new row of products is named by what it lists ("Just in").
   - **A section's sheet** in 3a holds its switch and Remove (asked first); 3b fills it with what the section holds.
     The header's row opens Logo and icon, the footer's Shop details (its contact and social links).
   - **No "In the header: logo only / logo and name" choice:** the server keeps no such setting; the header shows the
     logo where there is one, else the name.
   - **"Publish?" names a section's change generally** ("“Hero slides” changed"), not what changed in it.
   - **The logo's hint** says what Lytro takes (JPEG, PNG or WebP; no SVG).
   - **Product, in Bangla, is প্রোডাক্ট** as everywhere in the dashboard, where the sketch's lines say পণ্য.
   - Test pictures: `e2e/storefront-design.spec.ts` shoots each `e-*` screen beside the sketch, phone and desktop,
     both languages, into `test-results/compare/storefront-*`.

   **3b, sketched 2026-11-18 and approved by the owner the same day ("ok"), as built** (the sketch's `e-cats`, `e-row-cat`, `e-pick`, `e-link`,
   `e-announce`, `e-banners`, `e-banner`, `e-wide`, `e-quotes`, `e-quote` and `e-about`, beside 3a's drawn `e-hero`,
   `e-slide` and `e-products`). Every section opens its own sheet:
   - **Hero:** auto or the seller's slides, its design (photo and words, full photo, slide and two tiles), up to three
     slides moved up and down; a slide's photo with its focal point, kicker, headline, description, button and where
     it leads.
   - **A row of products:** which products (newest, on sale, best sellers, one category, hand-picked), its title,
     grid or carousel, how many. One category adds the category to pick, its name the title until changed;
     hand-picked opens a step to search and tick up to twelve, kept in the order chosen.
   - **Categories:** an optional title (the theme's when empty) and one of four looks, the theme's own marked.
   - **Announcement bar:** auto (what is on sale and the delivery charges) or the seller's own line, up to 120
     characters, shown as shoppers will see it.
   - **Offer banners:** auto (the biggest discount and the newest product) or up to two of the seller's own; a banner
     is a slide's fields with a 40-character headline.
   - **Wide banner** and **About the shop** open their sheet first when added; the section joins the draft once it
     holds what it needs (a photo and a headline; a title and its words), so none is ever empty.
   - **Testimonials:** an optional title and up to six quotes, each a name, an optional place and the words (up to
     240 characters), moved up and down; added the same way, with its first quote.
   - **A button's place:** On sale, Just in, Best sellers, a category or a product, each picked from a list.
   - **The trust strip** keeps 3a's sheet: it fills itself, with nothing to write.
   - A sheet's changes go into the draft with Done, as one save; closing a changed sheet asks first. A photo under
     1200 px wide is turned away before it uploads. "Add a section" gains the wide banner, testimonials and About.
   - Photos upload as the logo does (`shop_logo`, SB-14). The width a photo keeps once stored -- its long edge cut to
     1600 px, so a tall photo loses width -- is checked before it is sent: `storefrontPhotoFits` in validators, beside
     `IMAGE_LONG_EDGE_PX`, now the one definition the server's image processing reads too. A picture uploaded in a sheet
     and never kept (the sheet closed, or the photo replaced before Done) is deleted (MED-09).
   - The pickers read the shop's categories and products, so they need `products:read` beside `settings:manage`;
     the owner has both.

   **3b's named deviations from the sketch:**
   - **The dashboard's own sheet:** a bottom sheet on a phone, a 480 px panel from the right from 640 px, where the
     sketch centres a box on a desktop.
   - **The whole photo shows under its focal point,** not a 150 px band: the dot's place on the picture is then the
     place kept. The dot also moves with the arrow keys.
   - **A hand-picked row has no "How many":** it shows what was chosen.
   - **A row's category is the browser's own list** of the shop's categories with their counts.
   - **Counts are in the dashboard's digits** ("12/60 অক্ষর"), as every count in the dashboard is; the sketch wrote
     them in Bangla digits.
   - **The trust strip keeps 3a's sheet:** its switch, and a note that it fills itself.

**Tests** prove each SB row against its words, with a sabotage pass on SB-12 (a draft is never public or cached) and on
SB-9 (an ended offer leaves the hero). Each PR runs the checks in `ENGINEERING-STANDARDS.md` §7 and a real boot of the
built server.

## 5. Design cards and the product order (sketched 2026-11-18)

The owner, 2026-11-18: "unwrap the product to populate the storefront ... spread each design with their variant in
the storefront", then "the tenants can see the pre built product list in his dashboard, he can reorder product there
which reflect ordering in customer storefront". A product's photo designs (PHOTO-DESIGNS-PLAN) each become their own
card in the shop, and the seller sets the order of the cards. Sketch: `e-cards`, `e-order`, `e-spread` in
`docs/brand/lytro-storefront-builder.html`; the product page opening with a design chosen is lytro-storefront.html's
`product-photos-chosen`.

| ID | Decision |
|----|----------|
| DC-1 | **Everywhere** (the owner): home rows, category pages, All products, New arrivals, On sale, Best sellers and search show one card per design of a product with two or more designs. One design or none: one card, as before. |
| DC-2 | **One switch per shop, on by default** (the owner), in Settings > Storefront > Design ("Each design as its own card"). It goes live at once, not through the draft (as built: see below). |
| DC-3 | **A design card opens the product page with that design chosen** (the owner): the tap on the card is the shopper's deliberate choice (PD rule "no mismatch"), and only the size is left to pick. The link is `/p/<slug>?d=<design>`, applied in the browser as `?v=` is (the edge keeps the page without its query). |
| DC-4 | **No limit per row** (the owner): a product's designs all show, even if one product fills a home row. No random order. |
| DC-5 | **A card is the product's name and the design's photo** -- no design words for the shopper (PD) -- with the design's own lowest price, its own saving and badge, and its own stock: a sold-out design leaves the lists as a sold-out product does. A category's count stays a count of products. |
| DC-6 | **The seller's order** (the owner): a dashboard screen, Product list, lists every card -- each design apart, hidden and sold-out ones marked but kept in place -- in the shop's order. **Each card moves on its own; one order for the whole shop** (a category page shows it filtered). **Dragging by a handle, on a computer and on a phone; on a phone also arrows and Move to top / Move to bottom** (the owner: "with drag and re ordering also"). Save order makes it live at once and clears the shop's pages from the edge. |
| DC-8 | **The seller picks per product** (the owner, 2026-11-18: "show the compacted one also along with spreaded product"): a product with two or more designs shows its designs as cards (the default), its one compact card, or both -- chosen in the Product list's "⋯" menu. The compact card is placed and dragged like any card. With design cards off, every product shows one card. |
| DC-7 | **Which lists follow it** (the owner): the default lists -- category pages, All products, and a home row of one category. New arrivals (newest), On sale (biggest saving), Best sellers (most sold) and search (best match) keep their own order. A card the seller hasn't placed -- a new product or design -- comes first, newest first, until it is moved. |

**How it is built (one PR):**
- **Storage:** the order is a list of cards kept per shop (product, and design or none, with its place), not
  `products.sort_order`, since a design moves on its own. The switch is a column of the shop's design row, on unless turned off.
- **Public list (PRD-09):** with the switch on, the products list answers one entry per design: its card key, cover,
  price, saving, badges and stock of that design. Featured, the default, follows the seller's order; the other sorts
  are per card. Pages and counts are of cards. The answer format goes up, so a storefront and server out of step stay
  correct.
- **Storefront:** cards link with `?d=`; the product page chooses that design on opening.
- **Dashboard:** the switch card on the design page, and the Product list screen (drag on a computer, arrows on a
  phone, Save order).
- **Requirements:** SFT-03 and PRD-09 are amended for design cards and the seller's order at the build.

**As built (one PR):**
- **The switch and the Product list go live at once**, not through the draft: a key added to the design document
  would make the previous release refuse the whole document (its schema is strict) while two releases run side by
  side, so the switch is a column of the shop's design row instead (`storefront_designs.design_cards`). The design
  page's card says so. This changes my own first call in DC-2.
- **Storage (migration 0144):** `tenant.storefront_card_positions` (a product, and a design or none, with its place;
  one row per card, no design counted as one value) and `tenant.storefront_product_cards` (a product's way, kept only
  when not the default), each with row-level security and keys to the product and the design.
- **The public list** spreads designs only when the storefront asks (`designs=true`), so other websites on the public
  API keep one card per product. A design's figures are worked out from its live variants as a product's are; a
  product's own card in "both" or "one card" shows the product's figures. Every order ends with the design's number;
  Featured puts the cards not placed first, newest first, then the placed ones by their place (a product's own card
  not placed takes its first design's place). Saving the order or the switch moves the catalogue's version and clears
  the shop's pages from the edge.
- **The storefront** asks for design cards in every list (the home's product rows, category pages, All products, New
  arrivals, On sale, Best sellers, search, "You may also like", next pages); the auto hero and auto banners stay a
  product each. A design's card links `?d=`, applied as `?v=` is.
- **The Product list** reads every card that could show, so a product's way changes its cards at once; dragging uses
  the pointer (a handle held on a phone or with a mouse), the page scrolling near an edge, and the arrow keys on the
  handle; a search filters what shows and stops dragging until cleared; leaving unsaved asks first.

**Design cards' named deviations from the sketch:**
- **The dashboard's own parts**, as in 3a: its cards, buttons, switch, search field, status tags and page frame.
- **Four cards a row on a wide computer, three below** (the sketch's five): the dashboard's page is narrower than the
  sketch's pane, and five cut the names short.
- **The menu's tick** is the dashboard's check icon.
- **No "New" tag on a card in the Product list:** the list shows what the seller needs to place a card (its photo,
  name, design, price, sold out or hidden).

## 6. Banner layouts, the bar's pairs, the hero's tiles and dragged sections

The owner, 2026-11-18, pointing at Bonik AI's shop (bonikai.shop/ayesha-dress-corner): "make the storefront design
section draggable to reorder"; the banner area's "three different types of display ... offer collection, new product";
"the seller can add multiple banner but the layout is stacked vertically always"; the announcement bar showing its
contents "pair by pair like carousel"; the bar "hidden after scroll"; "include order track at the header". Sketched in
`docs/brand/lytro-storefront-builder.html`: the shop's `v-top`, `v-scroll` and `v-banners`, and the editor's `e-home`
(handles), `e-drag`, `e-hero`, `e-place`, `e-announce`, `e-banners` and `e-banners-auto`.

**BL-1 to BL-11: the owner's answers (2026-11-18).**

| # | Decision | Decided |
|---|---|---|
| BL-1 | **Reordering sections.** | Each section row gets a **handle, held and dragged** with a mouse or a finger; the arrows stay. Letting go saves the draft. The header and footer never move. (SB-1's "no free drag-and-drop" is about placing things freely on the page; moving a section in the list was always allowed.) |
| BL-2 | **Bonik's banner.** | **"Slide and two tiles" is upgraded, not joined by a fourth design:** its slide now **rotates** (it showed one), and each tile shows what the seller picked. |
| BL-3 | **What the seller picks.** | **Per place.** The auto slides show **Offers** (the biggest savings; the newest with nothing on sale), **Newest** or **Best sellers**. Each tile shows **On sale**, **Just in**, **Best sellers** or **a category**. Defaults: slides Offers; tiles On sale and Just in. |
| BL-4 | **The tiles on a phone.** | **Under the slide, side by side** (as "Slide and two tiles" already draws them), not hidden as Bonik hides them. |
| BL-5 | **The slides' choice and the other designs.** | Offers / Newest / Best sellers works for **every hero design** that fills itself. |
| BL-6 | **Banner layouts.** | Three: **Full width** (one under another, today's phone look), **Side by side**, **Big + two** (Bonik's). **Left alone, the number decides:** one full width, two side by side, three big + two; the seller can change it. |
| BL-7 | **How many banners.** | **Up to three** (was two). |
| BL-8 | **A half-width banner on a phone.** | **A compact tile:** the photo, the kicker and the headline, the whole tile a link; no description or button. |
| BL-9 | **Banners that fill themselves.** | **Per place**, as the tiles: On sale, Just in, Best sellers or a category; a new section starts with On sale, Just in, Best sellers. |
| BL-10 | **The announcement bar.** | **One list, two items at a time**, the next two every few seconds (five items: 1-2, 3-4, 5). Three are automatic: **cash on delivery**, **the delivery charges** in the owner's words ("ঢাকায় ডেলিভারি সর্বোচ্চ ৳৭০ · ঢাকার বাইরে সর্বোচ্চ ৳১৩০"), and **the offers on now** (only while something is on sale); each can be turned off. The seller adds lines of their own; **six items in all**, reorderable. **The bar leaves as the page scrolls; the header stays** (Bonik's). |
| BL-11 | **Order tracking in the header.** | A truck icon leading to `/track`; on a computer with "অর্ডার ট্র্যাক / অর্ডার কোথায় আছে" beside it (Bonik's). |

**BL-12 to BL-20: my calls in the sketch**, each open to the owner's overrule.

| # | Decision | Decided |
|---|---|---|
| BL-12 | **A tile's or an auto banner's words and photo.** | From the shop's data, never typed: On sale "অফার চলছে · X% পর্যন্ত ছাড়" (and "N টি পণ্যে" on a banner); Just in and Best sellers the product's name ("N বার অর্ডার হয়েছে" on a banner); a category its name and count. The photo is the first product of the collection that the slide or an earlier place does not show; with none left, the collection's last. A tap opens the collection's page (`/offers`, `/new`, `/best`, the category). |
| BL-13 | **An empty collection** (an offer that ended, no sales in 30 days). | The place shows the next of On sale, Just in, Best sellers that no other place in the section shows, so a tile or banner never goes blank. |
| BL-14 | **Tiles with the seller's own slides.** | The tiles stay and do not rotate with the slides. |
| BL-15 | **A layout that no longer fits** (Big + two picked, then a banner removed). | The number's own layout until it fits again; the pick is kept. |
| BL-16 | **The bar's timing.** | **Four seconds** a pair, sliding up. Paused while hovered or focused; with reduced motion the pair changes without sliding. Every item is in the page for screen readers; only one pair shows. |
| BL-17 | **The bar's height.** | Every pair sits in one grid cell, so the bar keeps its tallest pair's height and nothing below it jumps; an item's parts never break inside ("ঢাকার বাইরে সর্বোচ্চ ৳১৩০" stays whole), so a long pair wraps between items. |
| BL-18 | **The seller's own line.** | Up to **40 characters** each (the old single line held 120; a pair has to fit a phone). A saved draft's old line becomes the first own item (only staging holds any; how one longer than 40 is kept is settled at the build). |
| BL-19 | **The header on a phone with four icons.** | Search, order tracking, account and cart; a centred logo (Royal, Studio) centres in the room between the menu and the icons, so nothing overlaps. |
| BL-20 | **Fixes the sketch names.** | The auto slide (the tiles' design) takes the tiles' dark shade and white words on every theme (Soft, Fresh and Bold had none, leaving words on a bare photo), its button is the light one, and its discount badge no longer stretches across a computer's slide. |

**The owner's fixes on staging (2026-11-19):**
- **The bar on a phone** (BL-17 changed): below 640 pixels the items turn one at a time, each on one centered line
  ending in "…" if it is still too long; a wider screen keeps the pairs.
- **A banner's words** set its height below the computer layout when they need more room, and its title shrinks with a
  narrow screen, so its button never falls past the bottom edge.
- **The trust strip** sits centered: three items (one turned off) leave no empty place at one end.
- **A list page's "In stock only"** sits on the title's line; Sort, where the page has it, stays below the chips.
- **The footer's contact column** names the shop's WhatsApp and Facebook page, when it has them, beside the round icons.

**Named deviations from the sketch, as built:**
- **The delivery line names the shop's own zones** ("ঢাকা সিটির ভেতরে ডেলিভারি সর্বোচ্চ ৳70 · ঢাকা সিটির বাইরে সর্বোচ্চ
  ৳130"), not "ঢাকায় ... ঢাকার বাইরে": a shop's home area is not always Dhaka, and DLV-01 already names the home and
  fallback zones after it (or the seller renames them). The highest of the other zones is "outside". With a charge per
  kilo (RAT-14), each part says where it starts ("৳70 থেকে"), since "up to" would be wrong. /v1/shop gains each zone's
  `kind` and `extraDeliveryChargePerKg` for it; the sketch now says the same. Taka amounts are in Western digits, as the
  storefront writes every amount.
- **The editor shows each collection by its icon and line** ("On sale · Every discounted product"), and the bar's
  automatic items by their names ("Delivery charges"), where the sketch draws a product's photo and the live words:
  the editor reads none of the shop's product lists for them, and the live preview beside it shows the real thing.
- **The bar's pairs wrap only between items** (`<wbr>` after each dot): the sketch's first pair had no break point and
  ran off a phone's edge.
- **The auto hero's button is the light one**, and its slide and tiles keep their words on a dark shade on every theme
  (BL-20).

**Build:** after the design cards PR merges (it adds the shared handle the section rows reuse; its drag logic becomes one
hook for both screens). One PR from main: validators (hero `slides` source and `tiles`, banners `layout` and auto
places, the announcement's item list with a read-time upgrade of saved drafts), the storefront (the rotating bar that
leaves on scroll, the header's tracking link, the hero's rotating slide and tiles, the banner layouts) and the dashboard
(the handle, the hero, banners and bar sheets, the place picker).

## 7. Phones and wide screens, beside Bonik AI

The owner, 2026-11-19, on staging at 320px beside a Bonik AI shop: "the brand name, and the banner button also. the
first banner is bigger in mobile device ... any one can look at it at a glance. And there is a clear noticable distance
between top category section and banner section. look at the screen when we click hamburger icon"; then, on the hero's
sheet: "when seller choose first two layout ... they take full width in larger device it does not looks good".
Sketched (the phone rules, `v-menu`) and approved the same day.

| # | Decision | Decided |
|---|---|---|
| BL-21 | **The hero on a phone.** | Every design is a compact card: rounded, 16px from the edges and 16px under the category chips, about as tall as it is wide, its words on the photo, a smaller headline and button. A split hero's photo fills the card. |
| BL-22 | **The hero on a computer.** | The photo-and-words and full-photo designs sit inside the page's width (1240px, 32px sides, 16px under the header), rounded, as the slide-and-tiles one does; never edge to edge. |
| BL-23 | **The shop's name on a phone.** | Menu, the mark, the name on one line cut with an ellipsis, then the icons; a logo picture shrinks to fit. A centred header (Royal, Studio) starts after the menu on a phone. |
| BL-24 | **The menu.** | On a phone the menu opens a drawer: the shop's name and ✕; All products, Offers; each category with its count; Track your order, My account, Chat on WhatsApp (when the shop gave a number); the language. Escape or the scrim closes it. It is drawn into the page's frame, since the header is a container that would hold a fixed panel inside its own box. |
| BL-25 | **The bar on a small phone.** | ~~Under 360px one item at a time.~~ **Superseded the same day by the owner's staging fix under BL-17 (#398): below 640px one item at a time, each on one line, a long one ending in "…"; pairs from 640px.** |
| BL-26 | **Checkout, as SB-17 says** (the owner, 2026-11-19: "check why this route is inconsistent with theme. does it keep old ui/ux"). | It did: checkout was still built on the plain shell, with the old header and footer and the brand's colours, not the theme's (2b gave the theme's header and footer to every page through ShopShell, and checkout was missed). Checkout now wears the theme's header (its way back leads to the cart), footer and tokens; it keeps its own "orders paused" notice, so the shell doesn't repeat it. The order's confirmation keeps its short header and takes the theme's colours and fonts. A product's landing page (`/l/...`) stays as built: its own short page for ads. |

