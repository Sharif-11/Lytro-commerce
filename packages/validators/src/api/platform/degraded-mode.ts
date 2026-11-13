import { z } from 'zod';

/**
 * DAT-38, D9-14 (Phase 9 Slice 9.5's read, the owner's answer 2026-11-13: "rate limits ÷2"): while degraded mode is on,
 * every per-minute rate limit is divided by this, unless the operator sets another factor. Plan limits never are.
 */
export const DEFAULT_DEGRADED_FACTOR = 2;
/** The most a per-minute rate limit is ever divided by: past this, shops would be all but stopped. */
export const DEGRADED_FACTOR_MAX = 10;

/** DAT-38: the stored switch -- whether it's on, and the notice it put up for every shop, to take down with it. */
export const degradedModeValueSchema = z
  .object({
    on: z.boolean(),
    noticeId: z.string().uuid().nullable(),
  })
  .strict();
export type DegradedModeValue = z.infer<typeof degradedModeValueSchema>;

/** DAT-38: the operator turning degraded mode on or off (PUT /operator/degraded-mode). */
export const degradedModeSwitchSchema = z.object({ on: z.boolean() }).strict();
export type DegradedModeSwitch = z.infer<typeof degradedModeSwitchSchema>;

/**
 * DAT-38 (the owner's words, 2026-11-13): the notice every shop sees while degraded mode is on, its first sentence the
 * title and its second the body.
 */
export const DEGRADED_NOTICE = {
  titleBn: 'কিছুক্ষণ এক্সপোর্ট, রিপোর্ট আর মেসেজ থেকে অর্ডার পড়া বন্ধ থাকবে।',
  bodyBn: 'অর্ডার আর পেমেন্ট ঠিকমতো চলছে।',
  titleEn: 'Exports, reports and reading orders from messages are paused for a while.',
  bodyEn: 'Orders and payments work as usual.',
} as const;
