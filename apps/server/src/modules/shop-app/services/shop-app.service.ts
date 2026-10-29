import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LYTRO_APP_COLORS } from '@lytronix/shared-types';
import {
  APP_SHORT_NAME_LENGTH,
  monogramLetter,
  shortNameOf,
  TenantState,
} from '@lytronix/validators';
import { BrandService } from '../../brand/services/brand.service';
import type { LiveBrand } from '../../brand/types/brand';
import { MediaService } from '../../media/services/media.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { DASHBOARD_ICON_FILES, ShopIconFile, type ShopManifest } from '../types/shop-app';
import { ShopIcons } from './shop-icons';

// SFT-14, Slice 12c: the shop's storefront installs under its plain name, so its dashboard's app is the one marked.
const ADMIN_SUFFIX = ' Admin';

// Icons drawn and kept, the oldest let go first: a shop's few icons until its logo or name changes.
const ICONS_KEPT = 300;

/**
 * TEN-17: each shop's dashboard installs as its own app -- named after the shop with "Admin", with its logo or monogram
 * as the icon and a gear in its corner, scoped to the shop's own path, so two shops on one phone are two apps, and the
 * shop's storefront app (SFT-14, its plain name and icon, the `store-` files here) is told apart from it. With its brand identity showing (BRN-02), the
 * icon is the brand's square icon and the app takes the brand's colours. The manifest is read without a session (a
 * browser fetches it so), for any shop not deleted: a lapsed or suspended shop's owner still opens its dashboard. The
 * icons' links carry a version made from the name, the logo and the brand, so any change gives new icons at once.
 */
@Injectable()
export class ShopAppService {
  private readonly icons = new Map<string, Buffer>();

  constructor(
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(BrandService) private readonly brands: BrandService,
    @Inject(ShopIcons) private readonly drawing: ShopIcons,
  ) {}

  /** The shop's manifest, or null for no such shop (or one deleted). */
  async manifest(slug: string): Promise<ShopManifest | null> {
    const shop = await this.shopOf(slug);
    if (!shop) return null;
    const brand = await this.brands.live(shop.id);
    const version = this.versionOf(shop, brand, await this.media.logoFingerprint(shop.id));
    const path = `/${shop.slug}/`;
    const icon = (file: ShopIconFile): string =>
      `/api/v1/shops/${shop.slug}/icons/${file}?v=${version}`;
    return {
      id: path,
      name: `${shop.shopName}${ADMIN_SUFFIX}`,
      short_name: `${shortNameOf(shop.shopName, APP_SHORT_NAME_LENGTH - ADMIN_SUFFIX.length)}${ADMIN_SUFFIX}`,
      start_url: path,
      scope: path,
      display: 'standalone',
      lang: 'bn',
      theme_color: brand?.colors.main ?? LYTRO_APP_COLORS.theme,
      background_color: brand?.colors.background ?? LYTRO_APP_COLORS.background,
      icons: [
        { src: icon(ShopIconFile.Icon192), sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon(ShopIconFile.Icon512), sizes: '512x512', type: 'image/png', purpose: 'any' },
        {
          src: icon(ShopIconFile.Maskable512),
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };
  }

  /** One of the shop's icons as a PNG, or null for no such shop (or one deleted). */
  async icon(slug: string, file: ShopIconFile): Promise<Buffer | null> {
    const shop = await this.shopOf(slug);
    if (!shop) return null;
    const brand = await this.brands.live(shop.id);
    const version = this.versionOf(shop, brand, await this.media.logoFingerprint(shop.id));
    const key = `${shop.id}:${version}:${file}`;
    const kept = this.icons.get(key);
    if (kept) return kept;
    // Not kept: the picture is read from storage, only now, and the icon drawn; the dashboard's with its gear.
    const plain = await this.draw(shop, brand, file);
    const drawn = DASHBOARD_ICON_FILES.has(file) ? await this.drawing.withGear(plain, file) : plain;
    this.icons.set(key, drawn);
    if (this.icons.size > ICONS_KEPT) {
      const oldest = this.icons.keys().next().value;
      if (oldest !== undefined) this.icons.delete(oldest);
    }
    return drawn;
  }

  /** The brand's square icon while the brand shows (BRN-02), else the shop's logo, else its monogram (TEN-16). */
  private async draw(
    shop: TenantSummary,
    brand: LiveBrand | null,
    file: ShopIconFile,
  ): Promise<Buffer> {
    const icon = brand?.icon ? await this.media.imageFile(shop.id, brand.icon.id) : null;
    if (icon) return this.drawing.fromIcon(icon.body, file);
    const logo = await this.media.logoImage(shop.id);
    return logo
      ? this.drawing.fromLogo(logo.body, file)
      : this.drawing.fromLetter(monogramLetter(shop.shopName, shop.slug), file);
  }

  private async shopOf(slug: string): Promise<TenantSummary | null> {
    const shop = await this.shops.findBySlug(slug);
    return shop && shop.state !== TenantState.Deleted ? shop : null;
  }

  /** A short fingerprint of what the app shows: the shop's name, its logo and its brand. */
  private versionOf(shop: TenantSummary, brand: LiveBrand | null, logoHash: string | null): string {
    return createHash('sha256')
      .update(`${shop.shopName}\u0000${logoHash ?? ''}\u0000${brand?.version ?? ''}`)
      .digest('hex')
      .slice(0, 12);
  }
}
