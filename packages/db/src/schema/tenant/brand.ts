import { sql } from 'drizzle-orm';
import { boolean, check, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { BrandCorners, BrandFont, BrandSpacing, enumTuple } from '@lytronix/validators';
import { tenant } from '../shared';

export const brandFont = tenant.enum('brand_font', enumTuple(Object.values(BrandFont)));
export const brandCorners = tenant.enum('brand_corners', enumTuple(Object.values(BrandCorners)));
export const brandSpacing = tenant.enum('brand_spacing', enumTuple(Object.values(BrandSpacing)));

// BRN-02, BRN-07: a shop's own brand identity, one row per shop that has ever saved one, kept as validated design
// tokens -- three colours, its heading and body fonts from the curated pairs, its corners and spacing -- with the logo
// for dark backgrounds and the square icon, each a ready image of its own (cleared when the image is deleted). The
// logo on light is the shop's own logo (shop_settings, TEN-16). `use_brand` is the owner's switch; whether the
// identity shows also needs the add-on or the plan (BRN-05), so a lapse keeps both the settings and the switch.
export const brandIdentities = tenant.table(
  'brand_identities',
  {
    tenantId: uuid('tenant_id').primaryKey(),
    useBrand: boolean('use_brand').notNull().default(false),
    mainColor: varchar('main_color', { length: 7 }).notNull(),
    accentColor: varchar('accent_color', { length: 7 }).notNull(),
    backgroundColor: varchar('background_color', { length: 7 }).notNull(),
    headingFont: brandFont('heading_font').notNull(),
    bodyFont: brandFont('body_font').notNull(),
    corners: brandCorners('corners').notNull(),
    spacing: brandSpacing('spacing').notNull(),
    darkLogoMediaId: uuid('dark_logo_media_id'),
    iconMediaId: uuid('icon_media_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'brand_identities_colors_check',
      sql`${t.mainColor} ~ '^#[0-9a-f]{6}$' AND ${t.accentColor} ~ '^#[0-9a-f]{6}$' AND ${t.backgroundColor} ~ '^#[0-9a-f]{6}$'`,
    ),
    // BRN-02: the display pair sets headings only.
    check('brand_identities_body_font_check', sql`${t.bodyFont} <> 'galada_playfair_display'`),
  ],
);

export type SelectBrandIdentity = typeof brandIdentities.$inferSelect;
export type InsertBrandIdentity = typeof brandIdentities.$inferInsert;
