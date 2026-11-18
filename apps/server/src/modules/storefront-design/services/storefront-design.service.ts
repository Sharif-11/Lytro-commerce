import { Inject, Injectable } from '@nestjs/common';
import type { Transaction } from '@lytronix/db';
import {
  AuditAction,
  STOREFRONT_PHOTO_MIN_WIDTH,
  StorefrontCardMode,
  ServerFieldProblemCode,
  startingDesign,
  startingTheme,
  storefrontDesignSchema,
  storefrontMediaIds,
  storefrontPhotoRefs,
  storefrontTargetRefs,
  storefrontTargets,
  type StorefrontDesign,
} from '@lytronix/validators';
import { ApiError, FieldsError, type InvalidField } from '../../../common/api-error';
import { CatalogueVersion } from '../../catalogue/services/catalogue-version';
import { CatalogueActivity } from '../../catalogue/services/catalogue-activity';
import { CatalogueImages } from '../../catalogue/services/catalogue-images';
import type { CatalogueActor } from '../../catalogue/types/catalogue';
import { EdgePurges } from '../../shared/edge-cache/services/edge-purges';
import type { StorefrontDesignStore } from '../ports/storefront-design-store';
import { STOREFRONT_DESIGN_STORE } from '../tokens';
import type {
  PublicStorefrontDesign,
  StorefrontCardsView,
  StorefrontDesignRecord,
  StorefrontEditorView,
  StorefrontPreviewLink,
  StorefrontSale,
  StorefrontTarget,
  StorefrontTargetView,
} from '../types/storefront-design';
import { StorefrontPreviewLinks } from './storefront-preview-links';

/** A stored copy as a design; null for none, or for one this release cannot read (the starting design then shows). */
function designOf(stored: unknown): StorefrontDesign | null {
  if (stored === null || stored === undefined) return null;
  const parsed = storefrontDesignSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}

function targetView(row: StorefrontTarget): StorefrontTargetView {
  return { id: row.id, slug: row.slug, name: row.name };
}

/**
 * What one step leaves in the row: each copy it changes (a stored copy moving as it was stored), the stored one where
 * it leaves it.
 */
interface Step {
  draft?: unknown;
  published?: unknown;
  previous?: unknown;
  draftSavedAt?: Date | null;
  publishedAt?: Date | null;
}

/**
 * SB-11 to SB-14, SB-16: a shop's storefront design. Edits save to a draft on the server (so a phone and a desktop see
 * one draft); Publish makes it live and keeps the live one as the one before, which "Back" restores; both purge the
 * shop's pages from the edge (D9-32) and are logged (AUD-01). A shop that has published nothing shows its type's
 * starting design. A photo, category or product a design names that is later deleted is left out where it shows, and
 * the editor marks its section.
 */
@Injectable()
export class StorefrontDesignService {
  constructor(
    @Inject(STOREFRONT_DESIGN_STORE) private readonly store: StorefrontDesignStore,
    @Inject(CatalogueImages) private readonly images: CatalogueImages,
    @Inject(CatalogueActivity) private readonly activity: CatalogueActivity,
    @Inject(EdgePurges) private readonly edge: EdgePurges,
    @Inject(StorefrontPreviewLinks) private readonly previews: StorefrontPreviewLinks,
    @Inject(CatalogueVersion) private readonly version: CatalogueVersion,
  ) {}

  /** SB-12: the editor's read. */
  editor(tenantId: string): Promise<StorefrontEditorView> {
    return this.store.run((tx) => this.editorIn(tx, tenantId));
  }

  /** SB-12, SB-15, SB-16: saves the draft whole; its photos and what it points at must be the shop's. */
  saveDraft(tenantId: string, design: StorefrontDesign): Promise<StorefrontEditorView> {
    return this.store.run(async (tx) => {
      const row = await this.store.lock(tx, tenantId);
      await this.refuseUnfit(tx, tenantId, design);
      await this.write(tx, tenantId, row, { draft: design, draftSavedAt: new Date() });
      return this.editorIn(tx, tenantId);
    });
  }

  /** SB-12: drops the draft, so the editor shows the live design again. */
  discardDraft(tenantId: string): Promise<StorefrontEditorView> {
    return this.store.run(async (tx) => {
      const row = await this.store.lock(tx, tenantId);
      await this.write(tx, tenantId, row, { draft: null, draftSavedAt: null });
      return this.editorIn(tx, tenantId);
    });
  }

  /** SB-12, SB-13: the draft goes live, the live one is kept as the one before, and shoppers see it within a minute. */
  async publish(tenantId: string, actor: CatalogueActor): Promise<StorefrontEditorView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(async (tx) => {
      const row = await this.store.lock(tx, tenantId);
      const draft = designOf(row.draft);
      if (!draft) throw new ApiError('conflict', 'StorefrontNothingToPublish', {});
      await this.write(tx, tenantId, row, {
        draft: null,
        draftSavedAt: null,
        published: draft,
        previous: row.published,
        publishedAt: new Date(),
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.StorefrontPublished,
        { type: 'tenant', id: tenantId },
        { theme: draft.theme, palette: draft.palette, sections: draft.sections.length },
      );
      await this.edge.shop(tx, tenantId);
      return this.editorIn(tx, tenantId);
    });
  }

  /**
   * SB-12, SB-13: "Back to the previous design" -- the one before goes live again, and the one it replaces becomes the
   * one before, so a second tap undoes the first. A draft is dropped with it (the editor warns first).
   */
  async back(tenantId: string, actor: CatalogueActor): Promise<StorefrontEditorView> {
    const who = await this.activity.resolve(tenantId, actor);
    return this.store.run(async (tx) => {
      const row = await this.store.lock(tx, tenantId);
      const previous = designOf(row.previous);
      if (!previous) throw new ApiError('conflict', 'StorefrontNothingToGoBackTo', {});
      await this.write(tx, tenantId, row, {
        draft: null,
        draftSavedAt: null,
        published: previous,
        previous: row.published,
        publishedAt: new Date(),
      });
      await this.activity.record(
        tx,
        tenantId,
        who,
        AuditAction.StorefrontWentBack,
        { type: 'tenant', id: tenantId },
        { theme: previous.theme, palette: previous.palette, sections: previous.sections.length },
      );
      await this.edge.shop(tx, tenantId);
      return this.editorIn(tx, tenantId);
    });
  }

  /** SB-12: a short-lived link that draws the storefront from the draft. */
  previewLink(tenantId: string): StorefrontPreviewLink {
    return this.previews.make(tenantId);
  }

  /**
   * SB-11, SB-12, SB-14: the design shoppers see -- the live one, or the starting design -- with what it names
   * resolved. With a preview link for this shop, the draft instead (the live one when there is no draft); a link that
   * has ended or names another shop is refused, never quietly shown the live design.
   */
  live(tenantId: string, previewToken: string | null): Promise<PublicStorefrontDesign> {
    const preview = previewToken !== null;
    if (preview && !this.previews.opens(previewToken, tenantId)) {
      throw new ApiError('not_found', 'StorefrontPreviewEnded', {});
    }
    return this.store.run(async (tx) => {
      const row = await this.store.find(tx, tenantId);
      const design =
        (preview ? designOf(row?.draft) : null) ??
        designOf(row?.published) ??
        (await this.starting(tx, tenantId));
      const sections = design.sections.filter((section) => section.visible);
      const shown = { ...design, sections };
      const images = await this.images.viewsOf(tx, tenantId, storefrontMediaIds(shown));
      const wanted = storefrontTargets(shown);
      const targets = await this.store.targets(tx, tenantId, wanted.categoryIds, wanted.productIds);
      return {
        theme: design.theme,
        palette: design.palette,
        sections,
        images: Object.fromEntries(images),
        categories: targets.categories.filter((row) => row.shown).map(targetView),
        products: targets.products.filter((row) => row.shown).map(targetView),
        preview,
        designCards: row?.designCards ?? true,
      };
    });
  }

  /** DC-2, DC-6: the Product order screen's read -- the switch, and every card in its default lists' order. */
  cards(tenantId: string): Promise<StorefrontCardsView> {
    return this.store.run((tx) => this.cardsIn(tx, tenantId));
  }

  /**
   * DC-6: the seller's order, whole -- each card named once and each a card of the shop now (a product or design added
   * meanwhile may be left out: it stays first, newest first, until placed). The shop's lists show it at once: the
   * catalogue's version moves and its pages leave the edge.
   */
  saveOrder(
    tenantId: string,
    cards: readonly { productId: string; designId: string | null }[],
    modes: readonly { productId: string; mode: StorefrontCardMode }[] = [],
  ): Promise<StorefrontCardsView> {
    return this.store.run(async (tx) => {
      await this.store.lock(tx, tenantId);
      const designs = await this.store.designCards(tx, tenantId);
      const candidates = await this.store.cards(tx, tenantId, designs);
      const known = new Set(candidates.map(cardKey));
      // DC-8: only a product with designs to spread has a way.
      const spreadable = new Set(
        candidates.filter((card) => card.mode !== null).map((card) => card.productId),
      );
      const named = cards.map(cardKey);
      const products = modes.map((each) => each.productId);
      if (
        new Set(named).size !== named.length ||
        named.some((key) => !known.has(key)) ||
        new Set(products).size !== products.length ||
        products.some((id) => !spreadable.has(id))
      ) {
        throw new FieldsError([
          {
            field: 'cards',
            problem: ServerFieldProblemCode.NotFound,
            messageKey: 'StorefrontCardsChanged',
          },
        ]);
      }
      await this.store.replaceCardModes(tx, tenantId, modes);
      await this.store.replaceCardPositions(tx, tenantId, cards);
      await this.version.bump(tx, tenantId);
      return this.cardsIn(tx, tenantId);
    });
  }

  /** DC-2: each design its own card, or one card per product -- at once, every list of the shop. */
  setDesignCards(tenantId: string, on: boolean): Promise<StorefrontCardsView> {
    return this.store.run(async (tx) => {
      await this.store.lock(tx, tenantId);
      await this.store.setDesignCards(tx, tenantId, on);
      await this.version.bump(tx, tenantId);
      return this.cardsIn(tx, tenantId);
    });
  }

  private async cardsIn(tx: Transaction, tenantId: string): Promise<StorefrontCardsView> {
    const designCards = await this.store.designCards(tx, tenantId);
    const rows = await this.store.cards(tx, tenantId, designCards);
    const images = await this.images.viewsOf(
      tx,
      tenantId,
      rows.flatMap((row) => (row.coverMediaId === null ? [] : [row.coverMediaId])),
    );
    return {
      designCards,
      cards: rows.map((row) => ({
        productId: row.productId,
        designId: row.designId,
        name: row.name,
        designName: row.designName,
        designNumber: row.designNumber,
        price: row.price,
        stockState: row.stockState,
        active: row.active,
        image: row.coverMediaId === null ? null : (images.get(row.coverMediaId) ?? null),
        placed: row.placed,
        shown: row.shown,
        mode: modeOf(row.mode),
      })),
    };
  }

  /** SB-9: what the shop has on sale now, for the announcement that writes itself. */
  sale(tenantId: string): Promise<StorefrontSale> {
    return this.store.run((tx) => this.store.sale(tx, tenantId));
  }

  private async editorIn(tx: Transaction, tenantId: string): Promise<StorefrontEditorView> {
    const row = await this.store.find(tx, tenantId);
    const start = startingTheme(await this.store.businessType(tx, tenantId));
    const draft = designOf(row?.draft);
    const published = designOf(row?.published);
    const design = draft ?? published ?? startingDesign(start);
    const images = await this.images.viewsOf(tx, tenantId, storefrontMediaIds(design));
    const wanted = storefrontTargets(design);
    const targets = await this.store.targets(tx, tenantId, wanted.categoryIds, wanted.productIds);
    const reachable = new Set(
      [...targets.categories, ...targets.products].filter((row) => row.shown).map((row) => row.id),
    );
    const broken = new Set([
      ...storefrontPhotoRefs(design)
        .filter((photo) => !images.has(photo.mediaId))
        .map((photo) => photo.sectionId),
      ...storefrontTargetRefs(design)
        .filter((target) => !reachable.has(target.id))
        .map((target) => target.sectionId),
    ]);
    return {
      design,
      live: published ?? startingDesign(start),
      startingTheme: start,
      hasDraft: draft !== null,
      isPublished: published !== null,
      canGoBack: designOf(row?.previous) !== null,
      draftSavedAt: row?.draftSavedAt?.toISOString() ?? null,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
      images: Object.fromEntries(images),
      categories: targets.categories.map((row) => ({ ...targetView(row), shown: row.shown })),
      products: targets.products.map((row) => ({ ...targetView(row), shown: row.shown })),
      broken: design.sections
        .filter((section) => broken.has(section.id))
        .map((section) => section.id),
    };
  }

  private async starting(tx: Transaction, tenantId: string): Promise<StorefrontDesign> {
    return startingDesign(startingTheme(await this.store.businessType(tx, tenantId)));
  }

  /**
   * SB-15, SB-16, MED-03 (fields named under the request's `design`, as the schema names its own): each photo a ready
   * image of the shop's, a slide's or a banner's at least STOREFRONT_PHOTO_MIN_WIDTH wide; each category and product
   * one the shop has.
   */
  private async refuseUnfit(
    tx: Transaction,
    tenantId: string,
    design: StorefrontDesign,
  ): Promise<void> {
    const fields: InvalidField[] = [];
    const photos = storefrontPhotoRefs(design);
    const widths = await this.store.photoWidths(
      tx,
      tenantId,
      photos.map((photo) => photo.mediaId),
    );
    for (const photo of photos) {
      if (!widths.has(photo.mediaId)) {
        fields.push({
          field: `design.${photo.field}`,
          problem: ServerFieldProblemCode.NotFound,
          messageKey: 'MediaNotAttachable',
        });
      } else if (photo.wide && (widths.get(photo.mediaId) ?? 0) < STOREFRONT_PHOTO_MIN_WIDTH) {
        fields.push({
          field: `design.${photo.field}`,
          problem: ServerFieldProblemCode.OutOfRange,
          messageKey: 'StorefrontPhotoTooNarrow',
          params: { min: STOREFRONT_PHOTO_MIN_WIDTH },
        });
      }
    }
    const wanted = storefrontTargets(design);
    const targets = await this.store.targets(tx, tenantId, wanted.categoryIds, wanted.productIds);
    const known = new Set([...targets.categories, ...targets.products].map((row) => row.id));
    for (const target of storefrontTargetRefs(design)) {
      if (known.has(target.id)) continue;
      fields.push({
        field: `design.${target.field}`,
        problem: ServerFieldProblemCode.NotFound,
        messageKey:
          target.kind === 'category' ? 'StorefrontCategoryNotFound' : 'StorefrontProductNotFound',
      });
    }
    if (fields.length > 0) throw new FieldsError(fields);
  }

  /**
   * Writes what the step leaves, with every photo any copy now names. A copy this release cannot read (a later
   * release's) is kept as stored, and so are the photos the row listed, so none of its uses is lost.
   */
  private async write(
    tx: Transaction,
    tenantId: string,
    row: StorefrontDesignRecord,
    step: Step,
  ): Promise<void> {
    const draft = step.draft !== undefined ? step.draft : row.draft;
    const published = step.published !== undefined ? step.published : row.published;
    const previous = step.previous !== undefined ? step.previous : row.previous;
    const mediaIds = new Set<string>();
    for (const copy of [draft, published, previous]) {
      if (copy === null || copy === undefined) continue;
      const design = designOf(copy);
      for (const id of design ? storefrontMediaIds(design) : row.mediaIds) mediaIds.add(id);
    }
    await this.store.write(tx, tenantId, {
      draft,
      published,
      previous,
      mediaIds: [...mediaIds],
      draftSavedAt: step.draftSavedAt !== undefined ? step.draftSavedAt : row.draftSavedAt,
      publishedAt: step.publishedAt !== undefined ? step.publishedAt : row.publishedAt,
    });
  }
}

/** DC-6: a card as one value -- its product, and its design or none. */
function cardKey(card: { productId: string; designId: string | null }): string {
  return `${card.productId}:${card.designId ?? ''}`;
}

/** DC-8: a stored way as the type, any other value (none) as no way. */
function modeOf(value: string | null): StorefrontCardMode | null {
  return Object.values(StorefrontCardMode).find((mode) => mode === value) ?? null;
}
