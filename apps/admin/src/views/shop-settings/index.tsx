import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShopSettings, useUpdateShopSettings } from '@/api/shop-settings';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import {
  ShopSettingsForm,
  type ShopSettingsFormValues,
} from '@/views/shop-settings/shop-settings-form';

/** Container (ENGINEERING-STANDARDS.md §2a): owns the fetch and the save mutation; ShopSettingsForm stays
    presentational. TEN-30. */
export function ShopSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useShopSettings();
  const update = useUpdateShopSettings();
  const [saved, setSaved] = useState(false);

  function handleSubmit(values: ShopSettingsFormValues): void {
    setSaved(false);
    update.mutate(values, {
      onSuccess: () => {
        setSaved(true);
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-5 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('shopSettings.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('shopSettings.subtitle')}</p>
      </div>

      {settings.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {settings.isError ? <ErrorBanner message={errorMessage(settings.error, t)} /> : null}

      <ShopSettingsForm
        initial={settings.data}
        onSubmit={handleSubmit}
        pending={update.isPending}
        saved={saved}
        error={update.isError ? errorMessage(update.error, t) : null}
      />
    </div>
  );
}
