import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardTitle, CheckboxRow, ErrorBanner, TextField } from '@lytronix/ui';
import type { PlatformWallet } from '@/types/operator';

export interface WalletFormValues {
  provider: string;
  number: string;
  label: string | null;
  enabled: boolean;
  displayOrder: number;
}

interface WalletFormProps {
  mode: 'create' | 'edit';
  initial?: PlatformWallet;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: WalletFormValues) => void;
}

export function WalletForm({
  mode,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: WalletFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [provider, setProvider] = useState(initial?.provider ?? 'bKash');
  const [number, setNumber] = useState(initial?.number ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [displayOrder, setDisplayOrder] = useState(String(initial?.displayOrder ?? 0));

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      provider: provider.trim(),
      number: number.trim(),
      label: label.trim() === '' ? null : label.trim(),
      enabled,
      displayOrder: Number(displayOrder),
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <CardTitle>{mode === 'create' ? t('wallets.addTitle') : t('wallets.editTitle')}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('wallets.provider')}
            name="provider"
            required
            maxLength={40}
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
            }}
          />
          <TextField
            label={t('wallets.number')}
            name="number"
            required
            inputMode="tel"
            maxLength={20}
            value={number}
            onChange={(event) => {
              setNumber(event.target.value);
            }}
          />
          <TextField
            label={t('wallets.label')}
            name="label"
            maxLength={100}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
          <TextField
            label={t('wallets.displayOrder')}
            name="displayOrder"
            type="number"
            value={displayOrder}
            onChange={(event) => {
              setDisplayOrder(event.target.value);
            }}
          />
        </div>
        <CheckboxRow label={t('wallets.enabled')} checked={enabled} onChange={setEnabled} />
        {error ? <ErrorBanner message={error} /> : null}
        <div className="flex gap-2">
          <Button type="submit" fit loading={pending}>
            {mode === 'create' ? t('wallets.create') : t('common.save')}
          </Button>
          <Button type="button" tone="outline" fit onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
