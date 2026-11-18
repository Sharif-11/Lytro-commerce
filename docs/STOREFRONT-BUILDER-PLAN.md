# Storefront builder plan: every shop its own look

Status: designed 2026-11-18, to be built after Phase 9. SB-1 to SB-6 were settled with the owner that day, and the sketch
was approved ("its ok"). SB-7 to SB-20 follow from them, from existing requirements or from the sketch, and are raised
with this plan so the owner can overrule any of them.

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
| SB-3 | **When.** | **Designed now, built after Phase 9**, as its own work like the photo designs. Where it falls against Phase 10 (migration and launch) is the owner's call when Phase 9 closes. |
| SB-4 | **New features.** | **None in the first version:** only what Lytro already knows (products, categories, sale prices, sales figures, delivery fees, payment methods, the seller's own text and photos). Ratings and reviews, a newsletter, a wishlist and YouTube, TikTok and Instagram links come later, each as its own feature. |
| SB-5 | **Logo and icon** (the owner: "everyone can upload icon for website and app"). | **Every plan uploads its own icon,** one square image for the website (the browser tab) and the installed app (the phone's home screen), next to the logo, each with a live preview. With no icon it is made from the logo; with no logo, from the monogram (today's rule, `app-icons.ts`). |
| SB-6 | **Mobile first** (the owner: "all customer use mobile most of the time"). | **The phone is the design;** wider screens only add room: columns, side-by-side banners, the search bar. |

**SB-7 to SB-20 follow from SB-1 to SB-6 or from the sketch.**

| # | Decision | Decided |
|---|---|---|
| SB-7 | **The themes.** | **Five**, as sketched: **Royal** (perfume, jewellery), **Fresh** (food, grocery), **Bold** (gadgets, general stores), **Soft** (beauty, women's fashion), **Studio** (fashion). A theme is design tokens plus a default variant of each section:<br>• **Tokens:** colours, a heading and a body pair from `BRAND_FONTS`, corners.<br>• **Section variants:** a centred or bar header; an overlay, split or slide-plus-two-tiles hero; square, circle, tall or pill categories; framed, rounded, plain or photo product cards; the section heading's style.<br>Each theme has **three free colour sets**. |
| SB-8 | **The sections** (first version). | **Can be added, removed and repeated:**<br>• an announcement line;<br>• hero slides;<br>• categories;<br>• a product row;<br>• offer banners (one or two);<br>• a wide banner;<br>• a trust strip;<br>• testimonials;<br>• About the shop.<br>**Fixed, never removed:** the header (logo, menu, search, cart) and the footer (contact, social links, Powered by Lytro, TEN-18).<br>**Limits:**<br>• 12 sections;<br>• a hero of up to 3 slides;<br>• a product row of 4 to 12 products;<br>• 1 or 2 offer banners;<br>• up to 6 testimonials;<br>• up to 12 hand-picked products.<br>Every text field has a longest length (SEC-12); a headline is at most 60 characters. |
| SB-9 | **Sections fill themselves** (Bonik AI's lesson). | Until the seller writes their own, each section is filled from the shop's data:<br>• **Announcement:** "N পণ্যে X% পর্যন্ত ছাড়" from the products on sale, and the Dhaka delivery fee.<br>• **Hero:** the three biggest discounts, each with its own photo; a slide leaves when its offer ends.<br>• **Categories:** every top-level category with its picture, or else its first product's photo, and its product count.<br>• **Trust strip:** cash on delivery, the delivery fees from the shop's zones, its payment methods, order tracking.<br>• **Product rows:** **newest** first; **on sale** with the biggest discount first; **best sellers** from the last 30 days of delivered orders (Slice 4.7's figures); one category; or hand-picked. Sold-out products leave a row. |
| SB-10 | **Badges.** | Set by the data, never typed:<br>• the discount (−X%);<br>• **New** for 14 days after a product is added;<br>• **Best seller** for a shop's top sellers;<br>• **Only N left** under the product's low-stock level;<br>• **Ordered N times** from its delivered orders. |
| SB-11 | **Where a shop starts.** | A new shop starts on **its shop type's theme** with every section on auto:<br>• fashion → Studio;<br>• cosmetics → Soft;<br>• food and grocery → Fresh;<br>• gadgets and general stores → Bold;<br>• perfume and jewellery → Royal.<br>So it looks finished with no setup. **Before launch the only shops are tenant #1 (DAT-16) and staging's test shops, so every shop moves to its type's theme the same way;** today's home page is not kept as a sixth theme. This is my call; the owner can overrule it, at the cost of one more theme. |
| SB-12 | **Draft, preview and publish.** | Edits save to a **draft on the server**, so a phone and a desktop see the same draft. This differs from the brand editor's "edits stay on the page until Save" (11.2 point 2), because a home page takes longer than one sitting.<br>• **Preview:** the real storefront drawn from the draft through a short-lived signed link, never cached and never public. On a desktop it sits beside the editor; on a phone it opens full screen.<br>• **Publish:** makes the draft live and purges the shop's pages from the edge by tag (D9-32), so shoppers see it within a minute.<br>• **Back:** the previous published design is kept, and "Back to the previous design" is one tap. |
| SB-13 | **Who may edit.** | `settings:manage`, as the brand editor. Each publish and revert is in the shop's activity log (AUD-01). |
| SB-14 | **Storage.** | **One validated document per shop:** its theme, colour set and sections with their settings.<br>• **Three copies:** draft, published, previous.<br>• **One schema** in `packages/validators`, read by the server, the storefront and the dashboard. The Zod 4 walker guards apply.<br>• **Photos** are referred to by media ID with their own media purpose, and media uses count them.<br>• **The published copy** goes out with `/v1/shop`. |
| SB-15 | **Photos.** | Uploaded through the existing media pipeline. A banner or slide photo is at least 1200 px wide and stores a **focal point**: a phone keeps a square around it, a desktop a 1280 × 560 band. |
| SB-16 | **Where a button goes.** | To on sale, just in, best sellers, a category or a product, chosen from a list, never typed. A target that is deleted falls back to the home page, and the editor says which section points at it. |
| SB-17 | **Every other page.** | Only the home page has sections in this version. The category, search, product, cart and checkout pages take the theme's **tokens and product card**; their layout is as built. The payment page never changes beyond the shop's name and logo (PAY-05). |
| SB-18 | **The brand identity add-on with a theme.** | With "Use my brand" on, the identity's colours, fonts, corners and spacing replace the theme's tokens. The layout (the sections and their variants) stays the theme's. |
| SB-19 | **Contrast.** | Every theme colour set passes BRN-03 (4.5:1 body text, 3:1 large text); a test checks them all. Text over a photo always sits on the section's shade. |
| SB-20 | **What a theme never changes.** | The fixed status colours, Powered by Lytro and Secured by Lytro (TEN-18), the floating chat button (SFT-21's contacts), cash on delivery's wording, and the order and payment flows. |

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

---

## 4. Build

Three pull requests, each from `main`. The server goes first and the screens follow, as every phase does.

1. **The server.**
   - **Migration:** the shop's design document (draft, published, previous) and the banner photos' media purpose.
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
3. **The dashboard.** Settings > Storefront > Design:
   - the section list;
   - the theme gallery;
   - logo and icon with their previews;
   - the hero, slide, product-row and add-section sheets;
   - the live preview and publish.

   Pixel-perfect to the sketch's `e-*` screens.

**Tests** prove each SB row against its words, with a sabotage pass on SB-12 (a draft is never public or cached) and on
SB-9 (an ended offer leaves the hero). Each PR runs the checks in `ENGINEERING-STANDARDS.md` §7 and a real boot of the
built server.
