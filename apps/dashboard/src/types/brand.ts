import type { BrandContrast, BrandDesign } from '@lytronix/validators';
import type { ImageView } from './me';

/**
 * Mirrors `brandEditorSchema` in apps/server/src/modules/team/dto/brand.dto.ts: GET /brand, PUT /brand and
 * PUT /brand/switch answer it. No shared package exports response shapes yet, so this is a deliberate structural
 * duplicate of a server-only type.
 */

/** BRN-02: the saved identity (Lytro's default before the first save), with its two images. */
export interface BrandIdentity extends BrandDesign {
  darkLogo: ImageView | null;
  icon: ImageView | null;
}

/** BRN-02, BRN-03, BRN-05: the editor's read. */
export interface BrandEditor {
  /** The owner's switch, kept through a lapse. */
  useBrand: boolean;
  /** The add-on or the plan lets the identity show. */
  allowed: boolean;
  /** What everyone sees now: switched on and allowed. */
  live: boolean;
  identity: BrandIdentity;
  contrast: BrandContrast;
  savedAt: string | null;
}
