/**
 * LEG-01, LEG-02 (Phase 9 Slice 9.8): the terms of service and privacy policy versions whose text is published, each
 * named by the day it takes effect (the 9.8 read). The website keeps every listed version's text, so what a shop
 * accepted at sign-up can always be shown; the platform settings `terms_version` and `privacy_version` may only name
 * one of these, so sign-up never records a version that has no text. Oldest first; a new version is added here with
 * its text, in the same change.
 */
export const PUBLISHED_TERMS_VERSIONS = ['2026-11-20'] as const;
export const PUBLISHED_PRIVACY_VERSIONS = ['2026-11-20'] as const;

export type TermsVersion = (typeof PUBLISHED_TERMS_VERSIONS)[number];
export type PrivacyVersion = (typeof PUBLISHED_PRIVACY_VERSIONS)[number];

export function isPublishedTermsVersion(value: unknown): value is TermsVersion {
  return (PUBLISHED_TERMS_VERSIONS as readonly unknown[]).includes(value);
}

export function isPublishedPrivacyVersion(value: unknown): value is PrivacyVersion {
  return (PUBLISHED_PRIVACY_VERSIONS as readonly unknown[]).includes(value);
}

/** Public `GET /legal-versions` (Slice 9.8): the versions in force, as the platform settings name them. The website
    shows these on /terms and /privacy, so the pages and sign-up's record never disagree. */
export interface LegalVersionsView {
  termsVersion: string;
  privacyVersion: string;
}
