import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PickField } from '@/components/ui/field';
import type { ProductSettings } from '@/lib/product-settings';
import type { ProductDefaults } from '@/types/attribute';
import { PolicySheet } from './policy-sheet';
import { usePolicyWords } from './stock-words';

/** Its payment policy (PRD-08): its own or the shop's, opening the policy's sheet. A product's and a combo's. */
export function PolicyField({
  settings,
  shopDefault,
  readOnly,
  error,
  onSettings,
}: {
  settings: ProductSettings;
  shopDefault: ProductDefaults['shopPaymentPolicy'] | null;
  readOnly: boolean;
  error: string | undefined;
  onSettings: (patch: Partial<ProductSettings>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const policies = usePolicyWords();
  const [open, setOpen] = useState(false);
  const policy =
    settings.paymentPolicy === null
      ? `${t('policyShop')} · ${
          shopDefault
            ? policies.short(shopDefault.defaultPaymentPolicy, shopDefault.defaultAdvanceAmount)
            : ''
        }`
      : policies.short(settings.paymentPolicy, settings.advanceAmount);
  return (
    <>
      <PickField
        label={t('payPolicy')}
        value={policy}
        error={error}
        disabled={readOnly}
        onPick={() => {
          setOpen(true);
        }}
      />
      <PolicySheet
        open={open}
        policy={settings.paymentPolicy}
        advance={settings.advanceAmount}
        shopDefault={shopDefault}
        onDone={(paymentPolicy, advanceAmount) => {
          setOpen(false);
          onSettings({ paymentPolicy, advanceAmount });
        }}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
}
