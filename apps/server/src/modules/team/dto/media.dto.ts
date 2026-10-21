import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  MediaKind,
  MediaPurpose,
  MediaStatus,
  mediaListQuerySchema,
  startUploadSchema,
} from '@lytronix/validators';
import { imageViewSchema } from './catalogue-response.dto';

// DTO classes built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class StartUploadDto extends createZodDto(startUploadSchema) {}
export class MediaListQueryDto extends createZodDto(mediaListQuerySchema) {}

export const mediaViewSchema = z.object({
  id: z.string(),
  kind: z.nativeEnum(MediaKind),
  status: z.nativeEnum(MediaStatus),
  purpose: z.nativeEnum(MediaPurpose),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationMs: z.number().nullable(),
  bytes: z.number(),
  urls: imageViewSchema.shape.urls.nullable(),
  failure: z.string().nullable(),
  createdAt: z.date(),
});
export class MediaViewDto extends createZodDto(mediaViewSchema) {}

export const mediaDetailSchema = mediaViewSchema.extend({
  uses: z.object({
    products: z.number(),
    videos: z.number(),
    categories: z.number(),
    swatches: z.number(),
    sizeCharts: z.number(),
    logo: z.boolean(),
    pastOrders: z.number(),
  }),
});
export class MediaDetailDto extends createZodDto(mediaDetailSchema) {}

export const uploadStartedSchema = z.object({
  media: mediaViewSchema,
  upload: z.object({
    url: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string()),
    expiresAt: z.date(),
  }),
});
export class UploadStartedDto extends createZodDto(uploadStartedSchema) {}

export const mediaPageSchema = z.object({
  media: z.array(mediaViewSchema),
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  pages: z.number(),
});
export class MediaPageDto extends createZodDto(mediaPageSchema) {}

export const storageUsageSchema = z.object({
  usedBytes: z.number(),
  limitBytes: z.number().nullable(),
});
export class StorageUsageDto extends createZodDto(storageUsageSchema) {}

export const bandwidthUsageSchema = z.object({
  cycleStart: z.date(),
  usedBytes: z.number(),
  requests: z.number(),
  limitBytes: z.number().nullable(),
  days: z.array(z.object({ day: z.string(), bytes: z.number(), requests: z.number() })),
});
export class BandwidthUsageDto extends createZodDto(bandwidthUsageSchema) {}
