import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ShopSettings } from '@lytronix/validators';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';

export interface ShopSettingsFormValues {
  contactPhone: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
}

interface ShopSettingsFormProps {
  initial: ShopSettings | undefined;
  onSubmit: (values: ShopSettingsFormValues) => void;
  pending: boolean;
  saved: boolean;
  error: string | null;
}

/** Presentational (ENGINEERING-STANDARDS.md §2a): three independent fields -- an emptied field saves as
    `null` (clears it), not as an empty string left lying around. */
export function ShopSettingsForm({
  initial,
  onSubmit,
  pending,
  saved,
  error,
}: ShopSettingsFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');

  useEffect(() => {
    if (!initial) return;
    setContactPhone(initial.contactPhone ?? '');
    setContactEmail(initial.contactEmail ?? '');
    setBusinessAddress(initial.businessAddress ?? '');
  }, [initial]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      contactPhone: contactPhone.trim() === '' ? null : contactPhone.trim(),
      contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
      businessAddress: businessAddress.trim() === '' ? null : businessAddress.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <TextField
        label={t('shopSettings.contactPhone')}
        name="contactPhone"
        value={contactPhone}
        onChange={(event) => {
          setContactPhone(event.target.value);
        }}
      />
      <TextField
        label={t('shopSettings.contactEmail')}
        name="contactEmail"
        type="email"
        value={contactEmail}
        onChange={(event) => {
          setContactEmail(event.target.value);
        }}
      />
      <TextField
        label={t('shopSettings.businessAddress')}
        name="businessAddress"
        value={businessAddress}
        onChange={(event) => {
          setBusinessAddress(event.target.value);
        }}
      />

      {error ? <ErrorBanner message={error} /> : null}
      {saved ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t('shopSettings.saved')}
        </p>
      ) : null}

      <Button type="submit" loading={pending} className="w-auto!">
        {t('common.save')}
      </Button>
    </form>
  );
}
