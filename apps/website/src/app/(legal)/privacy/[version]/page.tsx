import type { Metadata } from 'next';
import { LegalRoute, legalMetadata } from '@/components/legal/legal-route';
import { legalLibrary } from '@/lib/legal/legal-library';

// LEG-01 (Slice 9.8): every published version of the privacy policy stays readable at its own address. A name that isn't
// published is a 404.
export const dynamicParams = false;

export function generateStaticParams(): { version: string }[] {
  return legalLibrary.versions('privacy').map((version) => ({ version }));
}

interface Props {
  params: Promise<{ version: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { version } = await params;
  return legalMetadata('privacy', version);
}

export default async function PrivacyVersionPage({ params }: Props) {
  const { version } = await params;
  return <LegalRoute kind="privacy" version={version} />;
}
