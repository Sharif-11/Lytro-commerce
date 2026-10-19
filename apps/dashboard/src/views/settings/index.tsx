import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useShopSettings, useUpdateShopSettings } from '@/api/shop-settings';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Card, Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner, Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';

/** TEN-30, RAT-14: the shop's contact details for the storefront, and its own extra delivery charge per kg.
    An emptied contact field saves as null (cleared). */
export function ShopSettingsView(): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useShopSettings();
  const update = useUpdateShopSettings();
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [extraPerKg, setExtraPerKg] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setContactPhone(settings.data.contactPhone ?? '');
    setContactEmail(settings.data.contactEmail ?? '');
    setBusinessAddress(settings.data.businessAddress ?? '');
    setExtraPerKg(settings.data.extraDeliveryChargePerKg);
  }, [settings.data]);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaved(false);
    update.mutate(
      {
        contactPhone: contactPhone.trim() === '' ? null : contactPhone.trim(),
        contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        businessAddress: businessAddress.trim() === '' ? null : businessAddress.trim(),
        extraDeliveryChargePerKg: extraPerKg.trim() === '' ? undefined : Number(extraPerKg),
      },
      {
        onSuccess: () => {
          setSaved(true);
        },
      },
    );
  }

  return (
    <Page narrow>
      <PageHeader title={t('settings.title')} lead={t('settings.lead')} />
      {settings.isError ? <ErrorBanner message={errorMessage(settings.error, t)} /> : null}
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField
            label={t('settings.contactPhone')}
            name="contactPhone"
            type="tel"
            inputMode="tel"
            value={contactPhone}
            onChange={(event) => {
              setContactPhone(event.target.value);
            }}
          />
          <TextField
            label={t('settings.contactEmail')}
            name="contactEmail"
            type="email"
            inputMode="email"
            value={contactEmail}
            onChange={(event) => {
              setContactEmail(event.target.value);
            }}
          />
          <TextField
            label={t('settings.businessAddress')}
            name="businessAddress"
            maxLength={300}
            value={businessAddress}
            onChange={(event) => {
              setBusinessAddress(event.target.value);
            }}
          />
          <TextField
            label={t('settings.extraPerKg')}
            name="extraPerKg"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={extraPerKg}
            hint={t('settings.extraPerKgHint')}
            onChange={(event) => {
              setExtraPerKg(event.target.value);
            }}
          />
          {update.isError ? <ErrorBanner message={errorMessage(update.error, t)} /> : null}
          {saved ? <Notice tone="success">{t('settings.saved')}</Notice> : null}
          <Button type="submit" fit loading={update.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Card>
    </Page>
  );
}
