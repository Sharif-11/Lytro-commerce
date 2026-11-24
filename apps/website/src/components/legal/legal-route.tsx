import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LegalVersionsApi } from '@/lib/api/legal-versions-api';
import { SiteEnvironment } from '@/lib/env';
import { requestLanguage } from '@/lib/i18n/read-language';
import { dhakaToday } from '@/lib/legal/legal-dates';
import { type LegalKind, legalLibrary } from '@/lib/legal/legal-library';
import { pageMetadata } from '@/lib/seo/site-pages';
import { LegalPage } from './legal-page';

/** /terms and /privacy show the version in force (`version` unset); /terms/<version> and /privacy/<version> show that
    published version, and any other name is a 404. */
export async function LegalRoute({ kind, version }: { kind: LegalKind; version?: string }) {
  const language = await requestLanguage.read();
  const named = await new LegalVersionsApi(SiteEnvironment.current()).current();
  const current = legalLibrary.inForce(
    kind,
    named === null ? null : kind === 'terms' ? named.termsVersion : named.privacyVersion,
    dhakaToday(),
  );
  const shown = version ?? current;
  const document = legalLibrary.find(kind, shown, language);
  if (!document) notFound();
  return (
    <LegalPage
      language={language}
      kind={kind}
      document={document}
      current={shown === current ? null : current}
    />
  );
}

/** The title (in Bangla like the site's other pages), description and address of /terms, /privacy or a version. */
export function legalMetadata(kind: LegalKind, version?: string): Metadata {
  return pageMetadata(kind, version);
}
