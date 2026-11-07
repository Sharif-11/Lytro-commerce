import { z } from 'zod';
import type { Language } from '../../validation/field-problem';

/** I18N-01, I18N-02: the languages a person can choose, Bangla first as the platform's default. */
export const LANGUAGES: readonly Language[] = ['bn', 'en'];

/**
 * I18N-01, NTF-03 (Slice 7.3's read, agreed 2026-11-07): the language a person chose in the dashboard, which the server
 * keeps so the email and push sent while they aren't looking are in it. Until one is chosen they go in Bangla.
 */
export const meLanguageSchema = z.object({ language: z.enum(['bn', 'en']) }).strict();
export type MeLanguageInput = z.infer<typeof meLanguageSchema>;
