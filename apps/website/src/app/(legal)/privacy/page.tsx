import { LegalRoute, legalMetadata } from '@/components/legal/legal-route';

// LEG-01, LEG-02 (Slice 9.8): the privacy policy in force. Sign-up's line links here.
export const metadata = legalMetadata('privacy');

export default function PrivacyPage() {
  return <LegalRoute kind="privacy" />;
}
