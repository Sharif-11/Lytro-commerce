import { z } from 'zod';
import {
  LIST_PAGE_SIZE_MAX,
  MEDIA_PAGE_SIZE,
  OPTION_VALUE_MAX_LENGTH,
  PRODUCT_IMAGES_MAX,
} from '../../common/limits';
import { MediaKind, MediaPurpose } from '../../db/enums';
import { FieldProblemCode } from '../../validation/field-problem';
import { catalogueIdSchema } from '../catalogue/catalogue-common';

// STO-04, STO-05: the types a browser may say it is sending, by kind. What the file really is, is checked by its
// content when it is processed.
export const IMAGE_CONTENT_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_CONTENT_TYPES: readonly string[] = ['video/mp4', 'video/webm'];

// MED-03: what each purpose takes: a product's video is a video, everything else an image.
export const MEDIA_PURPOSE_KIND: Readonly<Record<MediaPurpose, MediaKind>> = {
  [MediaPurpose.ProductImage]: MediaKind.Image,
  [MediaPurpose.ProductVideo]: MediaKind.Video,
  [MediaPurpose.CategoryImage]: MediaKind.Image,
  [MediaPurpose.SwatchImage]: MediaKind.Image,
  [MediaPurpose.SizeChartImage]: MediaKind.Image,
  [MediaPurpose.ShopLogo]: MediaKind.Image,
};

// The purposes whose upload may name its place; a size chart's image or the shop's logo has none to name.
const PURPOSES_WITH_TARGET: readonly MediaPurpose[] = [
  MediaPurpose.ProductImage,
  MediaPurpose.ProductVideo,
  MediaPurpose.CategoryImage,
  MediaPurpose.SwatchImage,
];

// POST media/uploads (MED-03, STO-03): starting an upload -- only the file's details, no file. The server checks the
// size, the shop's storage and the place it is for, then answers with a link to send the file to. `targetId` may name
// that place: the product, the category, or the attribute option; a size chart's image or the shop's logo has none.
export const startUploadSchema = z
  .object({
    kind: z.nativeEnum(MediaKind),
    contentType: z.string().trim().toLowerCase().max(100),
    bytes: z.number().int().positive(),
    purpose: z.nativeEnum(MediaPurpose),
    targetId: catalogueIdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const types = value.kind === MediaKind.Image ? IMAGE_CONTENT_TYPES : VIDEO_CONTENT_TYPES;
    if (!types.includes(value.contentType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contentType'],
        message:
          value.kind === MediaKind.Image
            ? 'Use a JPEG, PNG or WebP image.'
            : 'Use an MP4 or WebM video.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
    if (MEDIA_PURPOSE_KIND[value.purpose] !== value.kind) {
      ctx.addIssue({
        code: 'custom',
        path: ['purpose'],
        message:
          value.kind === MediaKind.Image
            ? 'This place takes a video, not an image.'
            : 'This place takes an image, not a video.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
    if (value.targetId !== undefined && !PURPOSES_WITH_TARGET.includes(value.purpose)) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: 'Leave this out for a size chart or the logo.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });
export type StartUploadInput = z.infer<typeof startUploadSchema>;

// GET media (MED-09): the shop's ready media, newest first, of one kind when asked.
export const mediaListQuerySchema = z.object({
  kind: z.nativeEnum(MediaKind).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIST_PAGE_SIZE_MAX).default(MEDIA_PAGE_SIZE),
});
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;

// PRD-11: a product's photos, in the order shown, each a ready image of the shop's, up to 50, each listed once -- for
// PUT products/:id/images and a new product alike.
export const productPhotoIdsField = z
  .array(catalogueIdSchema)
  .max(PRODUCT_IMAGES_MAX)
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'List each photo once.',
        params: { problem: FieldProblemCode.NotAllowed },
      });
    }
  });

// ATR-19 (PD-2, PD-16): a design as a photos save names it: by a key the request makes up, with the id of a design the
// product already has (left out for a new one), and its name: the seller's, or the one the shop's screen gives it.
export const DESIGN_KEY_MAX_LENGTH = 40;
const designKeySchema = z.string().trim().min(1).max(DESIGN_KEY_MAX_LENGTH);
export const productDesignSchema = z.object({
  key: designKeySchema,
  id: catalogueIdSchema.optional(),
  name: z.string().trim().min(1).max(OPTION_VALUE_MAX_LENGTH).optional(),
});
export type ProductDesignInput = z.infer<typeof productDesignSchema>;

// PRD-11, ATR-19: one photo, in its place, and the design it shows by its key, or null for a plain photo.
export const productPhotoSchema = z.object({
  mediaId: catalogueIdSchema,
  design: designKeySchema.nullable(),
});

// PUT products/:id/images (PRD-11, ATR-19): the product's photos, either as before (`mediaIds`, every one plain) or
// with their designs (`photos` and `designs`); an empty list removes them all. Every design shows at least one photo,
// and every photo's design is listed.
export const productImagesSchema = z
  .object({
    mediaIds: productPhotoIdsField.optional(),
    photos: z.array(productPhotoSchema).max(PRODUCT_IMAGES_MAX).optional(),
    designs: z.array(productDesignSchema).max(PRODUCT_IMAGES_MAX).optional(),
  })
  .superRefine((input, ctx) => {
    const problem = (path: (string | number)[], code: FieldProblemCode, message: string) => {
      ctx.addIssue({ code: 'custom', path, message, params: { problem: code } });
    };
    if ((input.mediaIds === undefined) === (input.photos === undefined)) {
      problem(
        ['photos'],
        FieldProblemCode.Required,
        'Send the photos one way: mediaIds or photos.',
      );
      return;
    }
    if (input.photos === undefined) {
      if (input.designs !== undefined)
        problem(['designs'], FieldProblemCode.NotAllowed, 'Designs come with photos.');
      return;
    }
    const designs = input.designs ?? [];
    const seenPhotos = new Set<string>();
    input.photos.forEach((photo, index) => {
      if (seenPhotos.has(photo.mediaId))
        problem(['photos', index, 'mediaId'], FieldProblemCode.NotAllowed, 'List each photo once.');
      seenPhotos.add(photo.mediaId);
    });
    const keys = new Set<string>();
    const ids = new Set<string>();
    designs.forEach((design, index) => {
      if (keys.has(design.key))
        problem(['designs', index, 'key'], FieldProblemCode.NotAllowed, 'List each design once.');
      keys.add(design.key);
      if (design.id !== undefined) {
        if (ids.has(design.id))
          problem(['designs', index, 'id'], FieldProblemCode.NotAllowed, 'List each design once.');
        ids.add(design.id);
      }
    });
    const shown = new Set<string>();
    input.photos.forEach((photo, index) => {
      if (photo.design === null) return;
      if (!keys.has(photo.design))
        problem(['photos', index, 'design'], FieldProblemCode.NotAllowed, 'Name a listed design.');
      shown.add(photo.design);
    });
    designs.forEach((design, index) => {
      if (!shown.has(design.key))
        problem(['designs', index], FieldProblemCode.TooFew, 'A design shows at least one photo.');
    });
  });
export type ProductImagesInput = z.infer<typeof productImagesSchema>;

// PUT shop-settings/logo (TEN-16): the shop's logo, one of its ready images, or null for its monogram.
export const shopLogoSchema = z.object({ mediaId: catalogueIdSchema.nullable() });
export type ShopLogoInput = z.infer<typeof shopLogoSchema>;

// PUT products/:id/video (PRD-11): the product's one video, a ready video of the shop's, or null for none.
export const productVideoSchema = z.object({ mediaId: catalogueIdSchema.nullable() });
export type ProductVideoInput = z.infer<typeof productVideoSchema>;
