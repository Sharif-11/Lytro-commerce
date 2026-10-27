import { z } from 'zod';

// MED-08: a ready image as every screen shows it: which item it is, and where its picture and thumbnail are read from.
export const imageViewSchema = z.object({
  id: z.string(),
  urls: z.object({ main: z.string(), thumbnail: z.string() }),
});

// PRD-11, STO-09: a ready video as a product shows it: the MP4 and its poster.
export const videoViewSchema = z.object({
  id: z.string(),
  urls: z.object({ video: z.string(), poster: z.string() }),
});

// PRD-11, STO-01: a product's photo in its editor, with the bytes it stores, every file of it.
export const productImageViewSchema = imageViewSchema.extend({ bytes: z.number() });

// PRD-11, STO-01, STO-09: a product's video in its editor, with its bytes and its length.
export const productVideoViewSchema = videoViewSchema.extend({
  bytes: z.number(),
  durationMs: z.number().nullable(),
});
