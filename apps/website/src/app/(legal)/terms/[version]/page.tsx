import type { Metadata } from 'next';
import { LegalRoute, legalMetadata } from '@/components/legal/legal-route';
import { legalLibrary } from '@/lib/legal/legal-library';

// LEG-01 (Slice 9.8): every published version of the terms stays readable at its own address, so a shop can always see
// the version it accepted. A name that isn't published is a 404.
export const dynamicParams = false;

export function generateStaticParams(): { version: string }[] {
  return legalLibrary.versions('terms').map((version) => ({ version }));
}

interface Props {
  params: Promise<{ version: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { version } = await params;
  return legalMetadata('terms', version);
}

export default async function TermsVersionPage({ params }: Props) {
  const { version } = await params;
  return <LegalRoute kind="terms" version={version} />;
}
