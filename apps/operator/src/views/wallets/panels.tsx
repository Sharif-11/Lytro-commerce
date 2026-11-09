import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, SelectField, TextField } from '@lytronix/ui';
import { PaymentWay } from '@lytronix/validators';
import {
  useAddBankAccount,
  useRemoveBankAccount,
  useRemoveGatewayKeys,
  useSaveGatewayKeys,
  useTestGateway,
  useUpdateBankAccount,
  useUpdatePaymentMethod,
} from '@/api/payment-methods';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { problemsOf } from '@/lib/form-problems';
import type { LytroBankAccount, LytroGateway, PlatformWallet } from '@/types/operator';

const BANK_FIELDS = [
  'bankName',
  'accountName',
  'accountNumber',
  'branch',
  'routingNumber',
  'swiftCode',
  'instructions',
];

/** OPERATOR-CONSOLE-DESIGN §10: one of Lytro's bank accounts, WAL-14's fields. */
export function BankPanel({
  account,
  onClose,
}: {
  account: LytroBankAccount | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const add = useAddBankAccount();
  const update = useUpdateBankAccount();
  const remove = useRemoveBankAccount();
  const saving = account ? update : add;
  const problems = problemsOf(saving.error, t, BANK_FIELDS);
  const [bankName, setBankName] = useState(account?.bankName ?? '');
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '');
  const [branch, setBranch] = useState(account?.branch ?? '');
  const [routingNumber, setRoutingNumber] = useState(account?.routingNumber ?? '');
  const [swiftCode, setSwiftCode] = useState(account?.swiftCode ?? '');
  const [instructions, setInstructions] = useState(account?.instructions ?? '');

  function submit(): void {
    const values = {
      bankName: bankName.trim(),
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      branch: branch.trim(),
      routingNumber: routingNumber.trim(),
      swiftCode: swiftCode.trim(),
      instructions: instructions.trim(),
    };
    const onSuccess = (): void => {
      toast(t('wallets.bankSaved'));
      onClose();
    };
    if (account) update.mutate({ id: account.id, ...values }, { onSuccess });
    else add.mutate(values, { onSuccess });
  }

  const field = (
    name: string,
    label: string,
    value: string,
    set: (next: string) => void,
    mono = false,
  ): React.JSX.Element => (
    <TextField
      label={label}
      name={name}
      mono={mono}
      error={problems.field(name)}
      value={value}
      onChange={(event) => {
        set(event.target.value);
      }}
    />
  );

  return (
    <ActionPanel
      title={t('wallets.bankTitle')}
      onClose={onClose}
      actionLabel={t('common.save')}
      pending={saving.isPending}
      canSubmit={bankName.trim() !== '' && accountName.trim() !== '' && accountNumber.trim() !== ''}
      error={problems.banner}
      onSubmit={submit}
    >
      {field('bankName', t('wallets.bankName'), bankName, setBankName)}
      {field('accountName', t('wallets.accountName'), accountName, setAccountName)}
      {field('accountNumber', t('wallets.accountNumber'), accountNumber, setAccountNumber, true)}
      {field('branch', t('wallets.branch'), branch, setBranch)}
      {field('routingNumber', t('wallets.routing'), routingNumber, setRoutingNumber, true)}
      {field('swiftCode', t('wallets.swift'), swiftCode, setSwiftCode)}
      {field('instructions', t('wallets.instructions'), instructions, setInstructions)}
      {account ? (
        <Button
          type="button"
          tone="ghost"
          small
          fit
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(account.id, {
              onSuccess: () => {
                toast(t('wallets.bankRemoved'));
                onClose();
              },
            });
          }}
        >
          {t('wallets.remove')}
        </Button>
      ) : null}
    </ActionPanel>
  );
}

const KEY_FIELDS = ['number', 'appKey', 'appSecret', 'username', 'password'];

/**
 * ADM-10, WAL-09, WAL-13: Lytro's own bKash account. The keys are sealed and never shown again. Saving tests the connection, then asks
 * separately whether to turn automatic checkout on, so connecting never changes how money is taken by itself.
 */
export function GatewayPanel({
  method,
  numbers,
  gateway,
  onClose,
}: {
  method: string;
  numbers: readonly PlatformWallet[];
  gateway: LytroGateway;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveGatewayKeys();
  const test = useTestGateway();
  const turnOn = useUpdatePaymentMethod();
  const problems = problemsOf(save.error, t, KEY_FIELDS);
  const [number, setNumber] = useState(gateway.number ?? numbers[0]?.number ?? '');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sandbox, setSandbox] = useState(gateway.connected ? gateway.sandbox : true);
  const [connected, setConnected] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const complete = [number, appKey, appSecret, username, password].every(
    (value) => value.trim() !== '',
  );

  function submit(): void {
    setRefused(null);
    save.mutate(
      { method, number, appKey, appSecret, username, password, sandbox },
      {
        onSuccess: () => {
          test.mutate(method, {
            onSuccess: (result) => {
              if (result.ok) setConnected(true);
              else setRefused(result.code ?? '');
            },
          });
        },
      },
    );
  }

  if (removing) return <RemoveKeysPanel method={method} onClose={onClose} />;

  if (connected) {
    return (
      <ActionPanel
        title={t('wallets.gwTitle')}
        onClose={onClose}
        actionLabel={t('wallets.gwOn')}
        pending={turnOn.isPending}
        error={turnOn.isError ? errorMessage(turnOn.error, t) : null}
        onSubmit={() => {
          turnOn.mutate(
            { method, way: PaymentWay.Automated },
            {
              onSuccess: () => {
                toast(t('wallets.gwTurnedOn'));
                onClose();
              },
            },
          );
        }}
      >
        <Banner tone="info" icon="check">
          {t('wallets.gwOk')}
        </Banner>
      </ActionPanel>
    );
  }

  return (
    <ActionPanel
      title={t('wallets.gwTitle')}
      onClose={onClose}
      actionLabel={t('wallets.gwSave')}
      pending={save.isPending || test.isPending}
      canSubmit={complete}
      error={problems.banner ?? (test.isError ? errorMessage(test.error, t) : null)}
      onSubmit={submit}
    >
      {refused !== null ? (
        <Banner tone="bad" icon="warn">
          {t('wallets.gwRefused', { code: refused })}
        </Banner>
      ) : null}
      {gateway.unreadable ? (
        <Banner tone="warn" icon="warn">
          {t('wallets.gwUnreadable')}
        </Banner>
      ) : gateway.connected ? (
        <Banner tone="info" icon="info">
          {t('wallets.gwSaved')}
        </Banner>
      ) : (
        <p className="text-[14px] text-fg-muted">{t('wallets.gwLead')}</p>
      )}
      <SelectField
        label={t('wallets.gwAccount')}
        name="number"
        value={number}
        onChange={(event) => {
          setNumber(event.target.value);
        }}
      >
        {numbers.map((each) => (
          <option key={each.id} value={each.number}>
            {each.number}
          </option>
        ))}
      </SelectField>
      {(
        [
          ['appKey', 'App key', appKey, setAppKey, 'text'],
          ['appSecret', 'App secret', appSecret, setAppSecret, 'password'],
          ['username', 'Username', username, setUsername, 'text'],
          ['password', 'Password', password, setPassword, 'password'],
        ] as const
      ).map(([name, label, value, set, type]) => (
        <TextField
          key={name}
          label={label}
          name={name}
          type={type}
          mono
          autoComplete="off"
          error={problems.field(name)}
          value={value}
          onChange={(event) => {
            set(event.target.value);
          }}
        />
      ))}
      <div>
        <Switch checked={sandbox} onChange={setSandbox} label={t('wallets.gwTest')} showLabel />
        <p className="mt-1 text-[13px] text-fg-muted">{t('wallets.gwTestHint')}</p>
      </div>
      {gateway.connected ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            tone="outline"
            small
            fit
            disabled={test.isPending}
            onClick={() => {
              setRefused(null);
              test.mutate(method, {
                onSuccess: (result) => {
                  if (result.ok) toast(t('wallets.gwTestOk'));
                  else setRefused(result.code ?? '');
                },
              });
            }}
          >
            {t('wallets.gwTestBtn')}
          </Button>
          <Button
            type="button"
            tone="ghost"
            small
            fit
            onClick={() => {
              setRemoving(true);
            }}
          >
            {t('wallets.gwRemove')}
          </Button>
        </div>
      ) : null}
    </ActionPanel>
  );
}

function RemoveKeysPanel({
  method,
  onClose,
}: {
  method: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useRemoveGatewayKeys();
  return (
    <ActionPanel
      title={t('wallets.gwRemove')}
      onClose={onClose}
      actionLabel={t('wallets.gwRemove')}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(method, {
          onSuccess: () => {
            toast(t('wallets.gwRemoved'));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">{t('wallets.gwRemoveConsequence')}</Consequence>
    </ActionPanel>
  );
}

/** §10: turning off the last method leaves no shop able to pay, so it asks first. */
export function TurnOffLastPanel({
  method,
  onClose,
}: {
  method: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdatePaymentMethod();
  return (
    <ActionPanel
      title={t('wallets.offTitle')}
      onClose={onClose}
      actionLabel={t('wallets.turnOff')}
      danger
      pending={update.isPending}
      error={update.isError ? errorMessage(update.error, t) : null}
      onSubmit={() => {
        update.mutate({ method, enabled: false }, { onSuccess: onClose });
      }}
    >
      <Consequence tone="danger">{t('wallets.offConsequence')}</Consequence>
    </ActionPanel>
  );
}
