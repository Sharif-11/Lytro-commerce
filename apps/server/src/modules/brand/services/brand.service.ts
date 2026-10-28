import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  BRAND_FONTS,
  BRAND_ICON_MIN_PX,
  BRAND_IDENTITY_ADDON,
  BRAND_PAIR_COLOR,
  DEFAULT_BRAND,
  ServerFieldProblemCode,
  brandContrast,
  brandIconFits,
  derivedBrandColors,
  featureOn,
  type BrandColors,
  type BrandDesign,
  type SaveBrandInput,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { MediaNotAttachable } from '../../../common/errors/media-refused';
import { CatalogueActivity, type ResolvedActor } from '../../catalogue/services/catalogue-activity';
import { CatalogueImages, refuseUnattachable } from '../../catalogue/services/catalogue-images';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import type { BrandStore } from '../ports/brand-store';
import { BRAND_STORE } from '../tokens';
import type { BrandEditorView, BrandRecord, BrandValues, LiveBrand } from '../types/brand';

function designOf(from: BrandDesign): BrandDesign {
  return {
    mainColor: from.mainColor,
    accentColor: from.accentColor,
    backgroundColor: from.backgroundColor,
    headingFont: from.headingFont,
    bodyFont: from.bodyFont,
    corners: from.corners,
    spacing: from.spacing,
  };
}

/** BRN-03: refuses colours that do not reach AA, each failing colour with the nearest shade of it that does. */
function refuseLowContrast(colors: BrandColors): void {
  const check = brandContrast(colors);
  if (check.passes) return;
  const fields = new Map<keyof BrandColors, InvalidField>();
  for (const pair of check.pairs) {
    const field = BRAND_PAIR_COLOR[pair.pair];
    if (pair.passes || fields.has(field)) continue;
    fields.set(field, {
      field,
      problem: ServerFieldProblemCode.LowContrast,
      messageKey: 'BrandContrastLow',
      params: { ratio: pair.ratio, needs: pair.needs, suggestion: check.suggestions[field] ?? '' },
    });
  }
  throw new FieldsError([...fields.values()], 'validation_error', { contrast: check });
}

/**
 * BRN-01 to BRN-03, BRN-05 to BRN-07: a shop's own brand identity. Any shop may design and save one; it shows only while
 * the owner's switch is on and the shop has the add-on or a plan that includes it, checked on every read, so a lapse
 * reverts it at once and buying again brings it back with the switch as it was. Switching on, and saving while on,
 * need every colour pair to reach AA. The logo on light is the shop's own logo (TEN-16).
 */
@Injectable()
export class BrandService {
  constructor(
    @Inject(BRAND_STORE) private readonly store: BrandStore,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
  ) {}

  /** BRN-02, BRN-06: the editor's read -- the saved identity (or Lytro's default), its check, and whether it shows. */
  editor(tenantId: string): Promise<BrandEditorView> {
    return this.store.run((tx) => this.editorIn(tx, tenantId));
  }

  /** BRN-02, BRN-03: saves the identity whole, switching it on or off in the same step when asked (Apply). */
  async save(
    tenantId: string,
    input: SaveBrandInput,
    actor: CatalogueActor,
  ): Promise<BrandEditorView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(async (tx) => {
      const stored = await this.store.find(tx, tenantId);
      const was = stored?.useBrand ?? false;
      const useBrand = input.useBrand ?? was;
      const design = designOf(input);
      await this.refuseUnfitImages(tx, tenantId, input);
      if (useBrand && !was) await this.refuseUnlessAllowed(tx, tenantId);
      if (useBrand) refuseLowContrast(design);
      await this.write(tx, tenantId, {
        ...design,
        useBrand,
        darkLogoMediaId: input.darkLogoId,
        iconMediaId: input.iconId,
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.BrandSaved,
        { type: 'tenant', id: tenantId },
        { ...design, darkLogoId: input.darkLogoId, iconId: input.iconId },
      );
      await this.recordSwitch(tx, tenantId, who, was, useBrand);
      return this.editorIn(tx, tenantId);
    });
  }

  /** BRN-02, BRN-05: "Use my brand", on or off; the identity is kept either way. */
  async setSwitch(
    tenantId: string,
    useBrand: boolean,
    actor: CatalogueActor,
  ): Promise<BrandEditorView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(async (tx) => {
      const stored = await this.store.find(tx, tenantId);
      const was = stored?.useBrand ?? false;
      if (useBrand === was) return this.editorIn(tx, tenantId);
      const values: BrandValues = stored ?? {
        ...DEFAULT_BRAND,
        useBrand,
        darkLogoMediaId: null,
        iconMediaId: null,
      };
      if (useBrand) {
        await this.refuseUnlessAllowed(tx, tenantId);
        refuseLowContrast(values);
      }
      await this.write(tx, tenantId, { ...designOf(values), ...imagesOf(values), useBrand });
      await this.recordSwitch(tx, tenantId, who, was, useBrand);
      return this.editorIn(tx, tenantId);
    });
  }

  /** BRN-01, BRN-05, BRN-07: the identity everyone sees, as tokens; null for Lytro's default. */
  live(tenantId: string): Promise<LiveBrand | null> {
    return this.store.run(async (tx) => {
      const stored = await this.store.find(tx, tenantId);
      if (!stored?.useBrand || !(await this.allowed(tx, tenantId))) return null;
      const images = await this.images.viewsOf(tx, tenantId, [
        stored.darkLogoMediaId,
        stored.iconMediaId,
      ]);
      const tokens: Omit<LiveBrand, 'version'> = {
        colors: {
          main: stored.mainColor,
          accent: stored.accentColor,
          background: stored.backgroundColor,
          ...derivedBrandColors(stored),
        },
        fonts: { heading: BRAND_FONTS[stored.headingFont], body: BRAND_FONTS[stored.bodyFont] },
        corners: stored.corners,
        spacing: stored.spacing,
        darkLogo: images.get(stored.darkLogoMediaId ?? '') ?? null,
        icon: images.get(stored.iconMediaId ?? '') ?? null,
      };
      const version = createHash('sha256')
        .update(JSON.stringify(tokens))
        .digest('hex')
        .slice(0, 12);
      return { version, ...tokens };
    });
  }

  private async editorIn(tx: Transaction, tenantId: string): Promise<BrandEditorView> {
    const stored = await this.store.find(tx, tenantId);
    const allowed = await this.allowed(tx, tenantId);
    const design = designOf(stored ?? DEFAULT_BRAND);
    const images = await this.images.viewsOf(tx, tenantId, [
      stored?.darkLogoMediaId,
      stored?.iconMediaId,
    ]);
    const useBrand = stored?.useBrand ?? false;
    return {
      useBrand,
      allowed,
      live: useBrand && allowed,
      identity: {
        ...design,
        darkLogo: images.get(stored?.darkLogoMediaId ?? '') ?? null,
        icon: images.get(stored?.iconMediaId ?? '') ?? null,
      },
      contrast: brandContrast(design),
      savedAt: stored?.updatedAt.toISOString() ?? null,
    };
  }

  /** BRN-05: the add-on held now, or a plan that includes the identity. */
  private async allowed(tx: Transaction, tenantId: string): Promise<boolean> {
    return featureOn(BRAND_IDENTITY_ADDON, await this.store.holdings(tx, tenantId));
  }

  private async refuseUnlessAllowed(tx: Transaction, tenantId: string): Promise<void> {
    if (!(await this.allowed(tx, tenantId))) {
      throw new ApiError('plan_feature_unavailable', 'BrandNeedsAddon', {});
    }
  }

  /** MED-03, BRN-02: each image a ready image of the shop's; the icon square, at least 512 px a side. */
  private async refuseUnfitImages(
    tx: Transaction,
    tenantId: string,
    input: Pick<SaveBrandInput, 'darkLogoId' | 'iconId'>,
  ): Promise<void> {
    const fields: InvalidField[] = [];
    const unattachable = (field: string): InvalidField => ({
      field,
      problem: ServerFieldProblemCode.NotFound,
      messageKey: 'MediaNotAttachable',
    });
    if (
      input.darkLogoId !== null &&
      !(await this.store.imageSize(tx, tenantId, input.darkLogoId))
    ) {
      fields.push(unattachable('darkLogoId'));
    }
    if (input.iconId !== null) {
      const size = await this.store.imageSize(tx, tenantId, input.iconId);
      if (!size) fields.push(unattachable('iconId'));
      else if (!brandIconFits(size.width ?? 0, size.height ?? 0)) {
        fields.push({
          field: 'iconId',
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'BrandIconNotSquare',
          params: { min: BRAND_ICON_MIN_PX },
        });
      }
    }
    if (fields.length > 0) throw new FieldsError(fields);
  }

  private async write(tx: Transaction, tenantId: string, values: BrandValues): Promise<void> {
    try {
      await this.store.save(tx, tenantId, values);
    } catch (error) {
      if (!(error instanceof MediaNotAttachable)) throw error;
      refuseUnattachable(error, values.iconMediaId === null ? 'darkLogoId' : 'iconId');
    }
  }

  private async recordSwitch(
    tx: Transaction,
    tenantId: string,
    who: ResolvedActor,
    was: boolean,
    now: boolean,
  ): Promise<void> {
    if (was === now) return;
    await this.activity.record(
      tx,
      tenantId,
      who,
      now ? AuditAction.BrandSwitchedOn : AuditAction.BrandSwitchedOff,
      { type: 'tenant', id: tenantId },
    );
  }
}

function imagesOf(record: BrandValues): Pick<BrandRecord, 'darkLogoMediaId' | 'iconMediaId'> {
  return { darkLogoMediaId: record.darkLogoMediaId, iconMediaId: record.iconMediaId };
}
