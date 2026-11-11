import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentWay } from '@lytronix/validators';
import {
  useChooseWay,
  useRemoveGatewayKeys,
  useSaveGatewayKeys,
  useSelectAutomated,
  useTestGateway,
} from '@/api/payment-methods';
import { ErrorBanner } from '@/components/error-banner';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { GatewayTest, PaymentMethodRow } from '@/types/payment-methods';
import { accountNumberOf, typeWord } from './words';

// What the gateway answers that isn't its own refusal: its limit on tries (WAL-13), and being out of reach.
const TOKEN_LIMIT = 'token_limit';
const OUT_OF_REACH: readonly string[] = ['timeout', 'unreachable'];

/** What a test found, as the sheet says it: connected, a refusal with bKash's code, two tries used, or out of reach. */
function TestAnswer({ answer }: { answer: GatewayTest }): React.JSX.Element {
  const { t } = useTranslation('menu');
  if (answer.ok) return <Banner tone="info">{t('pmGwOk')}</Banner>;
  if (answer.code === TOKEN_LIMIT) return <Banner tone="warn">{t('pmGwLimit')}</Banner>;
  if (answer.code !== null && OUT_OF_REACH.includes(answer.code)) {
    return <Banner tone="warn">{t('pmGwUnreachable')}</Banner>;
  }
  return <Banner tone="bad">{t('pmGwBad', { code: answer.code })}</Banner>;
}

/**
 * bKash's keys (TENANT-DASHBOARD-DESIGN §7.35, WAL-09, WAL-10; the prototype's `sh-pm33-gw`, `sh-pm33-gw-saved`): the
 * account that receives the money, the four fields, and Test account. They're never shown again, so changing them means
 * entering all four. Saving tests the connection, then asks separately whether to turn automated checkout on, so
 * connecting never changes how money is taken by itself.
 */
export function GatewaySheet({
  row,
  fee,
  onClose,
}: {
  row: PaymentMethodRow;
  /** Automated checkout's fee, as the page writes it. */
  fee: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const save = useSaveGatewayKeys();
  const test = useTestGateway();
  const select = useSelectAutomated();
  const way = useChooseWay();
  // As it opened: keys saved by this sheet and then refused don't turn it into Manage keys under the owner's hands.
  const [saved] = useState(
    () =>
      row.accounts.find((account) => account.hasCredentials && account.automated) ??
      row.accounts.find((account) => account.hasCredentials),
  );
  const unreadable = row.accounts.find((account) => account.credentialsUnreadable);
  const [accountId, setAccountId] = useState(
    saved?.id ??
      unreadable?.id ??
      row.accounts.find((account) => account.active)?.id ??
      row.accounts[0]?.id ??
      '',
  );
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sandbox, setSandbox] = useState(saved?.sandbox ?? false);
  const [answer, setAnswer] = useState<GatewayTest | null>(null);
  const [connected, setConnected] = useState(false);
  const [removing, setRemoving] = useState(false);
  const failure = save.error ?? test.error ?? select.error ?? way.error;
  const filled = [appKey, appSecret, username, password].every((value) => value.trim() !== '');
  const working = save.isPending || test.isPending || select.isPending || way.isPending;

  const saveAndTest = async (): Promise<void> => {
    setAnswer(null);
    await save.mutateAsync({
      accountId,
      input: {
        appKey: appKey.trim(),
        appSecret: appSecret.trim(),
        username: username.trim(),
        password: password.trim(),
        sandbox,
      },
    });
    const tested = await test.mutateAsync(accountId);
    if (!tested.ok) {
      setAnswer(tested);
      return;
    }
    if (row.way !== PaymentWay.Automated) {
      setConnected(true);
      return;
    }
    // Already on automated: the keys just moved or changed, so there's nothing more to ask.
    const chosen = row.accounts.find((account) => account.id === accountId);
    if (chosen && !chosen.automated) await select.mutateAsync(accountId);
    onClose();
  };

  const turnOn = async (): Promise<void> => {
    await select.mutateAsync(accountId);
    await way.mutateAsync({ method: row.method, way: PaymentWay.Automated });
    onClose();
  };

  if (removing && saved) {
    return (
      <RemoveKeysDialog
        row={row}
        accountId={saved.id}
        onKeep={() => {
          setRemoving(false);
        }}
        onRemoved={onClose}
      />
    );
  }

  if (connected) {
    return (
      <Sheet
        open
        title={t('pmGwTitle')}
        onClose={onClose}
        footer={
          <>
            <Button tone="outline" onClick={onClose}>
              {t('pmGwLater')}
            </Button>
            <Button
              busy={select.isPending || way.isPending}
              onClick={() => {
                turnOn().catch(() => undefined);
              }}
            >
              {t('pmGwOn')}
            </Button>
          </>
        }
      >
        <Banner tone="info">{t('pmGwOk')}</Banner>
        <div>
          <p className="text-[14px] text-fg-muted">{t('pmWayAutoD', { fee })}</p>
          <p className="mt-2 text-[14px] text-fg-muted">{t('pmAutoNote')}</p>
        </div>
        {failure ? <ErrorBanner error={failure} /> : null}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      title={t('pmGwTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={save.isPending || test.isPending || select.isPending}
          disabled={!filled || accountId === ''}
          onClick={() => {
            saveAndTest().catch(() => undefined);
          }}
        >
          {saved ? t('pmGwChange') : t('pmGwSave')}
        </Button>
      }
    >
      {answer ? <TestAnswer answer={answer} /> : null}
      {failure ? <ErrorBanner error={failure} /> : null}
      {row.accounts.length === 0 ? <Banner tone="warn">{t('pmGwNoAccount')}</Banner> : null}
      {saved ? (
        <Banner tone="neutral">{t('pmGwSaved')}</Banner>
      ) : (
        <p className="text-[14px] text-fg-muted">{t('pmGwLead')}</p>
      )}
      <SelectField
        label={t('pmGwAccount')}
        value={accountId}
        options={row.accounts.map((account) => ({
          value: account.id,
          label: `${accountNumberOf(account)} · ${typeWord(account.accountType, t)}`,
        }))}
        onChange={(event) => {
          setAccountId(event.target.value);
        }}
      />
      <Field
        label={t('pmGwKey')}
        value={appKey}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => {
          setAppKey(event.target.value);
        }}
      />
      <Field
        label={t('pmGwSecret')}
        type="password"
        value={appSecret}
        autoComplete="off"
        onChange={(event) => {
          setAppSecret(event.target.value);
        }}
      />
      <Field
        label={t('pmGwUser')}
        value={username}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => {
          setUsername(event.target.value);
        }}
      />
      <Field
        label={t('pmGwPass')}
        type="password"
        value={password}
        autoComplete="new-password"
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />
      <div className="flex min-h-11 items-center gap-3 py-2.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium">{t('pmGwTest')}</span>
          <span className="text-[14px] text-fg-muted">{t('pmGwTestD')}</span>
        </span>
        <Switch checked={sandbox} label={t('pmGwTest')} onChange={setSandbox} />
      </div>
      {saved ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            tone="outline"
            size="sm"
            busy={test.isPending}
            disabled={working}
            onClick={() => {
              setAnswer(null);
              test.mutate(saved.id, { onSuccess: setAnswer });
            }}
          >
            {t('pmGwTestBtn')}
          </Button>
          <Button
            tone="ghost"
            size="sm"
            disabled={working}
            onClick={() => {
              setRemoving(true);
            }}
          >
            <span className="text-danger">{t('pmGwRemove')}</span>
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/**
 * Removing the keys (the prototype's `dlg-pm33-gw-remove`): automated checkout stops and the wallet goes back to the
 * listener. The way goes first, since the server won't leave a wallet choosing automated with nothing to run it on.
 */
function RemoveKeysDialog({
  row,
  accountId,
  onKeep,
  onRemoved,
}: {
  row: PaymentMethodRow;
  accountId: string;
  onKeep: () => void;
  onRemoved: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const way = useChooseWay();
  const remove = useRemoveGatewayKeys();
  const failure = way.error ?? remove.error;

  const confirm = async (): Promise<void> => {
    if (row.way === PaymentWay.Automated) {
      await way.mutateAsync({ method: row.method, way: PaymentWay.Listener });
    }
    await remove.mutateAsync(accountId);
    onRemoved();
  };

  return (
    <Dialog
      open
      title={t('pmGwRmTitle')}
      onClose={onKeep}
      actions={
        <>
          <Button tone="outline" onClick={onKeep}>
            {t('pmKeep')}
          </Button>
          <Button
            tone="danger"
            busy={way.isPending || remove.isPending}
            onClick={() => {
              confirm().catch(() => undefined);
            }}
          >
            {t('pmGwRemove')}
          </Button>
        </>
      }
    >
      {t('pmGwRmText')}
      {failure ? (
        <div className="mt-3">
          <ErrorBanner error={failure} />
        </div>
      ) : null}
    </Dialog>
  );
}
