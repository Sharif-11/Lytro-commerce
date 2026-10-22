import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { LYTRO_APP_COLORS } from '@lytronix/shared-types';
import { TenantState } from '@lytronix/validators';
import { MediaService } from '../../media/services/media.service';
import { TenantSummaries } from '../../tenancy/services/tenant-summaries.service';
import type { TenantSummary } from '../../tenancy/types/tenant-summary';
import { ShopIconFile, type ShopManifest } from '../types/shop-app';
import { monogramLetter, ShopIcons } from './shop-icons';

// What a home screen shows under the icon has little room; a longer name is cut at a word.
const SHORT_NAME_LENGTH = 12;

// Icons drawn and kept, the oldest let go first: a shop's few icons until its logo or name changes.
const ICONS_KEPT = 300;

/** TEN-17: a shop's name as a home screen label -- up to 12 characters, cut at a word where one fits. */
export function shortNameOf(name: string): string {
  const characters = Array.from(name.trim());
  if (characters.length <= SHORT_NAME_LENGTH) return name.trim();
  const cut = characters.slice(0, SHORT_NAME_LENGTH).join('');
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/**
 * TEN-17: each shop's dashboard installs as its own app -- named after the shop, with its logo or monogram as the icon,
 * scoped to the shop's own path, so two shops on one phone are two apps. The manifest is read without a session (a
 * browser fetches it so), for any shop not deleted: a lapsed or suspended shop's owner still opens its dashboard. The
 * icons' links carry a version made from the name and the logo, so a new logo or name gives new icons at once.
 */
@Injectable()
export class ShopAppService {
  private readonly icons = new Map<string, Buffer>();

  constructor(
    @Inject(TenantSummaries) private readonly shops: TenantSummaries,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(ShopIcons) private readonly drawing: ShopIcons,
  ) {}

  /** The shop's manifest, or null for no such shop (or one deleted). */
  async manifest(slug: string): Promise<ShopManifest | null> {
    const shop = await this.shopOf(slug);
    if (!shop) return null;
    const version = this.versionOf(shop, await this.media.logoFingerprint(shop.id));
    const path = `/${shop.slug}/`;
    const icon = (file: ShopIconFile): string =>
      `/api/v1/shops/${shop.slug}/icons/${file}?v=${version}`;
    return {
      id: path,
      name: shop.shopName,
      short_name: shortNameOf(shop.shopName),
      start_url: path,
      scope: path,
      display: 'standalone',
      lang: 'bn',
      theme_color: LYTRO_APP_COLORS.theme,
      background_color: LYTRO_APP_COLORS.background,
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
    const kept = this.icons.get(this.keyOf(shop, await this.media.logoFingerprint(shop.id), file));
    if (kept) return kept;
    // Not kept: the logo itself is read from storage, only now, and the icon drawn.
    const logo = await this.media.logoImage(shop.id);
    const drawn = logo
      ? await this.drawing.fromLogo(logo.body, file)
      : await this.drawing.fromLetter(monogramLetter(shop.shopName, shop.slug), file);
    this.icons.set(this.keyOf(shop, logo?.hash ?? null, file), drawn);
    if (this.icons.size > ICONS_KEPT) {
      const oldest = this.icons.keys().next().value;
      if (oldest !== undefined) this.icons.delete(oldest);
    }
    return drawn;
  }

  private keyOf(shop: TenantSummary, logoHash: string | null, file: ShopIconFile): string {
    return `${shop.id}:${this.versionOf(shop, logoHash)}:${file}`;
  }

  private async shopOf(slug: string): Promise<TenantSummary | null> {
    const shop = await this.shops.findBySlug(slug);
    return shop && shop.state !== TenantState.Deleted ? shop : null;
  }

  /** A short fingerprint of what the icons show: the shop's name and its logo. */
  private versionOf(shop: TenantSummary, logoHash: string | null): string {
    return createHash('sha256')
      .update(`${shop.shopName}\u0000${logoHash ?? ''}`)
      .digest('hex')
      .slice(0, 12);
  }
}
