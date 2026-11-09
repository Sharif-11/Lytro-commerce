import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField, TextField } from '@lytronix/ui';
import { useCreatePlatformWallet, useUpdatePlatformWallet } from '@/api/platform-wallets';
import { ActionPanel } from '@/components/ui/action-panel';
import { TWO_FIELDS } from '@/components/ui/sizes';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { problemsOf } from '@/lib/form-problems';
import type { PlatformWallet } from '@/types/operator';
import { WALLET_PROVIDERS } from './providers';

const FIELDS = ['provider', 'number', 'label', 'displayOrder'];

/** OPERATOR-CONSOLE-DESIGN §10: one wallet number, shown to sellers in this order. */
export function WalletPanel({
  wallet,
  provider: startingProvider = 'bKash',
  nextOrder,
  onClose,
}: {
  wallet: PlatformWallet | null;
  /** The method's card it was opened from. */
  provider?: string;
  nextOrder: number;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreatePlatformWallet();
  const update = useUpdatePlatformWallet();
  const [provider, setProvider] = useState(wallet?.provider ?? startingProvider);
  const [number, setNumber] = useState(wallet?.number ?? '');
  const [label, setLabel] = useState(wallet?.label ?? '');
  const [order, setOrder] = useState(String(wallet?.displayOrder ?? nextOrder));
  const [enabled, setEnabled] = useState(wallet?.enabled ?? true);
  const saving = wallet ? update : create;
  const problems = problemsOf(saving.error, t, FIELDS);
  // A number the server already holds keeps its provider, even one this list doesn't name.
  const providers: string[] = WALLET_PROVIDERS.includes(provider)
    ? [...WALLET_PROVIDERS]
    : [provider, ...WALLET_PROVIDERS];

  function submit(): void {
    const values = {
      provider,
      number: number.trim(),
      label: label.trim() === '' ? null : label.trim(),
      displayOrder: Number(order),
      enabled,
    };
    const onSuccess = (): void => {
      toast(
        t(wallet ? 'wallets.saved' : 'wallets.added', {
          wallet: `${provider} ${values.number}`,
        }),
      );
      onClose();
    };
    if (wallet) update.mutate({ id: wallet.id, ...values }, { onSuccess });
    else create.mutate(values, { onSuccess });
  }

  return (
    <ActionPanel
      title={wallet ? t('wallets.editTitle') : t('wallets.newTitle')}
      sub={wallet ? `${wallet.provider} · ${wallet.number}` : undefined}
      onClose={onClose}
      actionLabel={wallet ? t('common.save') : t('wallets.create')}
      pending={saving.isPending}
      canSubmit={number.trim() !== ''}
      error={problems.banner}
      onSubmit={submit}
    >
      <SelectField
        label={t('wallets.provider')}
        name="provider"
        value={provider}
        onChange={(event) => {
          setProvider(event.target.value);
        }}
      >
        {providers.map((each) => (
          <option key={each} value={each}>
            {each}
          </option>
        ))}
      </SelectField>
      <TextField
        label={t('wallets.number')}
        name="number"
        required
        mono
        inputMode="tel"
        placeholder="01XXX XXXXXX"
        maxLength={20}
        data-autofocus
        error={problems.field('number')}
        value={number}
        onChange={(event) => {
          setNumber(event.target.value);
        }}
      />
      <TextField
        label={t('wallets.label')}
        name="label"
        maxLength={100}
        error={problems.field('label')}
        value={label}
        onChange={(event) => {
          setLabel(event.target.value);
        }}
      />
      <div className={`${TWO_FIELDS} items-end`}>
        <TextField
          label={t('wallets.order')}
          name="order"
          required
          mono
          inputMode="numeric"
          error={problems.field('displayOrder')}
          value={order}
          onChange={(event) => {
            setOrder(event.target.value);
          }}
        />
        <div className="flex min-h-field items-center">
          <Switch checked={enabled} onChange={setEnabled} label={t('wallets.shown')} showLabel />
        </div>
      </div>
    </ActionPanel>
  );
}
