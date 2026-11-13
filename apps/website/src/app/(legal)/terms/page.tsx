import { LegalRoute, legalMetadata } from '@/components/legal/legal-route';

// LEG-01, LEG-02 (Slice 9.8): the terms of service in force. Sign-up's line links here.
export const metadata = legalMetadata('terms');

export default function TermsPage() {
  return <LegalRoute kind="terms" />;
}
