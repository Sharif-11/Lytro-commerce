import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner, formatTaka, Page, PageHeader, TextField } from '@lytronix/ui';
import { useMe } from '@/api/me';
import { useShopSettings, useUpdateShopSettings } from '@/api/shop-settings';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { appConfig } from '@/lib/app-config';
import { useBusinessType, useDeliverySettings, usePresets } from '@/api/shop-setup';

/** Shop settings (TEN-30, RAT-14): grouped cards, each with its own Save, and a toast on success. */
export function ShopSettingsView(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const me = useMe();
  // The shop type and the zones' charges are the server's (PST-01, DLV-01) -- what set-up saved.
  const businessType = useBusinessType();
  const presets = usePresets();
  const delivery = useDeliverySettings();
  const settings = useShopSettings();
  const update = useUpdateShopSettings();
  const toast = useToast();
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [extraPerKg, setExtraPerKg] = useState('');
  const [saving, setSaving] = useState<'contact' | 'delivery' | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setContactPhone(settings.data.contactPhone ?? '');
    setContactEmail(settings.data.contactEmail ?? '');
    setBusinessAddress(settings.data.businessAddress ?? '');
    setExtraPerKg(settings.data.extraDeliveryChargePerKg);
  }, [settings.data]);

  const tenant = me.data?.tenant ?? null;
  const zones = delivery.data?.zones ?? [];
  const homeCharge = zones.find((zone) => zone.isHome)?.charge ?? null;
  const fallbackCharge = zones.find((zone) => zone.isFallback)?.charge ?? null;
  const preset = presets.data?.find((each) => each.key === businessType.data) ?? null;

  function saveContact(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaving('contact');
    update.mutate(
      {
        contactPhone: contactPhone.trim() === '' ? null : contactPhone.trim(),
        contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        businessAddress: businessAddress.trim() === '' ? null : businessAddress.trim(),
      },
      {
        onSuccess: () => {
          toast.show(t('settings.saved'));
        },
        onSettled: () => {
          setSaving(null);
        },
      },
    );
  }

  function saveDelivery(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSaving('delivery');
    update.mutate(
      { extraDeliveryChargePerKg: extraPerKg.trim() === '' ? 0 : Number(extraPerKg) },
      {
        onSuccess: () => {
          toast.show(t('settings.saved'));
        },
        onSettled: () => {
          setSaving(null);
        },
      },
    );
  }

  const card = 'space-y-4 rounded-card border border-line bg-white p-4 shadow-card sm:p-5';

  return (
    <Page>
      <PageHeader title={t('settings.title')} />
      {settings.isError ? <ErrorBanner message={errorMessage(settings.error, t)} /> : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          <form onSubmit={saveContact} className={card}>
            <h2 className="text-[17px] font-bold text-ink">
              {t('settings.contact')}
              <span className="block text-[13px] font-normal text-neutral-700">
                {t('settings.contactLead')}
              </span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
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
                placeholder="shop@example.com"
                value={contactEmail}
                onChange={(event) => {
                  setContactEmail(event.target.value);
                }}
              />
            </div>
            <TextField
              label={t('settings.businessAddress')}
              name="businessAddress"
              maxLength={300}
              value={businessAddress}
              onChange={(event) => {
                setBusinessAddress(event.target.value);
              }}
            />
            {update.isError && saving === 'contact' ? (
              <ErrorBanner message={errorMessage(update.error, t)} />
            ) : null}
            <div className="flex justify-end">
              <Button
                type="submit"
                fit
                className="min-h-10! text-[14px]!"
                loading={update.isPending && saving === 'contact'}
              >
                {t('common.save')}
              </Button>
            </div>
          </form>

          <form onSubmit={saveDelivery} className={card}>
            <h2 className="text-[17px] font-bold text-ink">{t('settings.delivery')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('settings.insideCity')}
                name="insideCity"
                value={homeCharge === null ? '' : formatTaka(homeCharge)}
                disabled
                readOnly
                hint={t('settings.zonesHint')}
              />
              <TextField
                label={t('settings.outsideCity')}
                name="outsideCity"
                value={fallbackCharge === null ? '' : formatTaka(fallbackCharge)}
                disabled
                readOnly
              />
            </div>
            <div className="max-w-[240px]">
              <TextField
                label={t('settings.extraPerKg')}
                name="extraPerKg"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                leading="৳"
                hint={t('settings.extraPerKgHint')}
                value={extraPerKg}
                onChange={(event) => {
                  setExtraPerKg(event.target.value);
                }}
              />
            </div>
            {update.isError && saving === 'delivery' ? (
              <ErrorBanner message={errorMessage(update.error, t)} />
            ) : null}
            <div className="flex justify-end">
              <Button
                type="submit"
                fit
                className="min-h-10! text-[14px]!"
                loading={update.isPending && saving === 'delivery'}
              >
                {t('common.save')}
              </Button>
            </div>
          </form>
        </div>

        {tenant ? (
          <section className="rounded-card border border-line bg-white p-4 shadow-card sm:p-5">
            <h2 className="text-[17px] font-bold text-ink">{t('settings.shop')}</h2>
            <dl className="mt-3 divide-y divide-dashed divide-line text-[14px]">
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-neutral-700">{t('settings.name')}</dt>
                <dd className="font-semibold text-ink">{tenant.shopName}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2">
                <dt className="text-neutral-700">{t('settings.address')}</dt>
                <dd className="num font-semibold text-ink">{appConfig.shopHost(tenant.slug)}</dd>
              </div>
              {preset ? (
                <div className="flex justify-between gap-3 py-2">
                  <dt className="text-neutral-700">{t('settings.type')}</dt>
                  <dd className="font-semibold text-ink">
                    {i18n.language === 'bn' ? preset.labelBn : preset.labelEn}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-[13px] text-neutral-700">{t('settings.brandingLater')}</p>
          </section>
        ) : null}
      </div>
      <Toast message={toast.message} />
    </Page>
  );
}
