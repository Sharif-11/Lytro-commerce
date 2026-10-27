import { z } from 'zod';
import { LIST_PAGE_SIZE_MAX, MEDIA_PAGE_SIZE, PRODUCT_IMAGES_MAX } from '../../common/limits';
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

// PUT products/:id/images (PRD-11): the product's photos; an empty list removes them all.
export const productImagesSchema = z.object({ mediaIds: productPhotoIdsField });
export type ProductImagesInput = z.infer<typeof productImagesSchema>;

// PUT shop-settings/logo (TEN-16): the shop's logo, one of its ready images, or null for its monogram.
export const shopLogoSchema = z.object({ mediaId: catalogueIdSchema.nullable() });
export type ShopLogoInput = z.infer<typeof shopLogoSchema>;

// PUT products/:id/video (PRD-11): the product's one video, a ready video of the shop's, or null for none.
export const productVideoSchema = z.object({ mediaId: catalogueIdSchema.nullable() });
export type ProductVideoInput = z.infer<typeof productVideoSchema>;
