import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import {
  PAYMENT_METHOD_TYPES,
  PaymentMethodKind,
  PaymentWay,
  walletNumber,
  WalletAccountType,
  type PaymentAccountInput,
} from '@lytronix/validators';
import { useChooseWay, useSaveMethod } from '@/api/payment-methods';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Dialog } from '@/components/ui/dialog';
import { AreaField, Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { PaymentAccount, PaymentMethodRow } from '@/types/payment-methods';
import { accountNumberOf, bodyOf, methodName, typeWord } from './words';

const TYPES: readonly WalletAccountType[] = [
  WalletAccountType.Personal,
  WalletAccountType.Agent,
  WalletAccountType.Merchant,
];

interface AccountSheetProps {
  row: PaymentMethodRow;
  /** The account being edited; none for a new one. */
  account: PaymentAccount | null;
  onClose: () => void;
  onDelete: (account: PaymentAccount) => void;
}

/** The account a sheet is about, or a bank's: the method's kind decides its fields (WAL-14). */
export function AccountSheet(props: AccountSheetProps): React.JSX.Element {
  return props.row.kind === PaymentMethodKind.Bank ? (
    <BankSheet {...props} />
  ) : (
    <WalletSheet {...props} />
  );
}

/** Saves the method's whole list with this account in it; a new one comes back not active (WAL-04). */
function useSaveAccount(row: PaymentMethodRow, account: PaymentAccount | null) {
  const { t } = useTranslation('menu');
  const { showToast } = useShell();
  const save = useSaveMethod();
  return {
    save,
    write: (body: PaymentAccountInput, onSaved: () => void): void => {
      const accounts = account
        ? row.accounts.map((each) => (each.id === account.id ? body : bodyOf(each)))
        : [...row.accounts.map(bodyOf), body];
      save.mutate(
        { method: row.method, input: { enabled: row.enabled, accounts } },
        {
          onSuccess: () => {
            if (!account) showToast(t('pmAdded'));
            onSaved();
          },
        },
      );
    },
  };
}

/** The server's word on one of the saved list's fields, by the place this account has in that list. */
function problemsOf(error: unknown, index: number): Record<string, string> {
  if (!(error instanceof ApiClientError)) return {};
  const prefix = `accounts.${String(index)}.`;
  return Object.fromEntries(
    Object.entries(error.fieldProblems()).flatMap(([field, message]) =>
      field.startsWith(prefix) ? [[field.slice(prefix.length), message]] : [],
    ),
  );
}

/**
 * A wallet's account (the prototype's `sh-pm33-account`, `sh-pm33-edit`): its number, its name, personal, agent or
 * merchant with what the customer will do, and a note. A wrong number or one already saved is said under the field.
 */
function WalletSheet({ row, account, onClose, onDelete }: AccountSheetProps): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const name = methodName(row.method, t);
  const { save, write } = useSaveAccount(row, account);
  const [number, setNumber] = useState(account ? accountNumberOf(account) : '');
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [type, setType] = useState(account?.accountType ?? WalletAccountType.Personal);
  const [note, setNote] = useState(account?.note ?? '');
  const [numberError, setNumberError] = useState<string | null>(null);
  const lengths = PAYMENT_METHOD_TYPES[row.method].numberLengths;
  const index = account ? row.accounts.indexOf(account) : row.accounts.length;
  const problems = problemsOf(save.error, index);

  const submit = (): void => {
    const local = walletNumber(number, lengths);
    if (local === null) {
      setNumberError(t('pmBadNo', { digits: lengths.join(` ${t('pmOr')} `) }));
      return;
    }
    if (row.accounts.some((each) => each.id !== account?.id && each.number === local)) {
      setNumberError(t('pmDupNo'));
      return;
    }
    setNumberError(null);
    write(
      {
        ...(account ? { id: account.id } : {}),
        accountName: accountName.trim(),
        number: local,
        accountType: type,
        note: note.trim() === '' ? undefined : note.trim(),
        active: account?.active ?? false,
      },
      onClose,
    );
  };

  const hint: Record<WalletAccountType, string> = {
    [WalletAccountType.Personal]: t('pmTypeP'),
    [WalletAccountType.Agent]: t('pmTypeA'),
    [WalletAccountType.Merchant]: t('pmTypeM'),
  };

  return (
    <Sheet
      open
      title={account ? t('pmAccEdit', { wallet: name }) : t('pmAccAdd', { wallet: name })}
      onClose={onClose}
      footer={
        <>
          {account ? (
            <Button
              tone="ghost"
              onClick={() => {
                onDelete(account);
              }}
            >
              <span className="text-danger">{t('pmDel')}</span>
            </Button>
          ) : null}
          <Button
            busy={save.isPending}
            disabled={number.trim() === '' || accountName.trim() === ''}
            wide={!account}
            onClick={submit}
          >
            {t('pmSave')}
          </Button>
        </>
      }
    >
      {save.isError && Object.keys(problems).length === 0 ? (
        <Banner tone="bad">{errorText(save.error)}</Banner>
      ) : null}
      <Field
        label={t('pmNumber', { wallet: name })}
        value={number}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        placeholder="01XXXXXXXXX"
        error={numberError ?? problems.number}
        onChange={(event) => {
          setNumber(event.target.value);
          setNumberError(null);
        }}
      />
      <Field
        label={t('pmName')}
        value={accountName}
        error={problems.accountName}
        onChange={(event) => {
          setAccountName(event.target.value);
        }}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{t('pmType')}</span>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((each) => (
            <Chip
              key={each}
              on={type === each}
              onClick={() => {
                setType(each);
              }}
            >
              {typeWord(each, t)}
            </Chip>
          ))}
        </div>
        <p className="text-[14px] text-fg-muted">{hint[type]}</p>
      </div>
      <AreaField
        label={t('pmNote')}
        value={note}
        error={problems.note}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}

/** A bank account (WAL-14, the prototype's `sh-pm33-bank`): its bank, name and number, and what's optional. */
function BankSheet({ row, account, onClose, onDelete }: AccountSheetProps): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { save, write } = useSaveAccount(row, account);
  const [bankName, setBankName] = useState(account?.bankName ?? '');
  const [accountName, setAccountName] = useState(account?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '');
  const [branch, setBranch] = useState(account?.branch ?? '');
  const [routingNumber, setRoutingNumber] = useState(account?.routingNumber ?? '');
  const [swiftCode, setSwiftCode] = useState(account?.swiftCode ?? '');
  const [instructions, setInstructions] = useState(account?.instructions ?? '');
  const index = account ? row.accounts.indexOf(account) : row.accounts.length;
  const problems = problemsOf(save.error, index);
  const optional = (value: string): string | undefined =>
    value.trim() === '' ? undefined : value.trim();

  const submit = (): void => {
    write(
      {
        ...(account ? { id: account.id } : {}),
        accountName: accountName.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        branch: optional(branch),
        routingNumber: optional(routingNumber),
        swiftCode: optional(swiftCode),
        instructions: optional(instructions),
        active: account?.active ?? false,
      },
      onClose,
    );
  };

  return (
    <Sheet
      open
      title={account ? t('pmBankEdit') : t('pmBankAdd')}
      onClose={onClose}
      footer={
        <>
          {account ? (
            <Button
              tone="ghost"
              onClick={() => {
                onDelete(account);
              }}
            >
              <span className="text-danger">{t('pmDel')}</span>
            </Button>
          ) : null}
          <Button
            busy={save.isPending}
            disabled={
              bankName.trim() === '' || accountName.trim() === '' || accountNumber.trim() === ''
            }
            wide={!account}
            onClick={submit}
          >
            {t('pmSave')}
          </Button>
        </>
      }
    >
      {save.isError && Object.keys(problems).length === 0 ? (
        <Banner tone="bad">{errorText(save.error)}</Banner>
      ) : null}
      <Field
        label={t('pmBankName')}
        value={bankName}
        error={problems.bankName}
        onChange={(event) => {
          setBankName(event.target.value);
        }}
      />
      <Field
        label={t('pmName')}
        value={accountName}
        error={problems.accountName}
        onChange={(event) => {
          setAccountName(event.target.value);
        }}
      />
      <Field
        label={t('pmBankNo')}
        value={accountNumber}
        error={problems.accountNumber}
        onChange={(event) => {
          setAccountNumber(event.target.value);
        }}
      />
      <Field
        label={t('pmBranch')}
        value={branch}
        error={problems.branch}
        onChange={(event) => {
          setBranch(event.target.value);
        }}
      />
      <Field
        label={t('pmRouting')}
        value={routingNumber}
        error={problems.routingNumber}
        onChange={(event) => {
          setRoutingNumber(event.target.value);
        }}
      />
      <Field
        label={t('pmSwift')}
        value={swiftCode}
        error={problems.swiftCode}
        onChange={(event) => {
          setSwiftCode(event.target.value);
        }}
      />
      <AreaField
        label={t('pmInstr')}
        value={instructions}
        error={problems.instructions}
        onChange={(event) => {
          setInstructions(event.target.value);
        }}
      />
    </Sheet>
  );
}

/**
 * Deleting an account (the prototype's `dlg-pm33-delete`): the active one says customers can't pay by the wallet until
 * another is active (WAL-04). One taking automated payments returns the wallet to the listener first, as removing keys
 * does, so a wallet is never left on automated with no account to take it.
 */
export function DeleteAccountDialog({
  row,
  account,
  onClose,
}: {
  row: PaymentMethodRow;
  account: PaymentAccount;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const save = useSaveMethod();
  const way = useChooseWay();
  const name = methodName(row.method, t);
  const failure = save.error ?? way.error;

  const remove = async (): Promise<void> => {
    if (account.automated && row.way === PaymentWay.Automated) {
      await way.mutateAsync({ method: row.method, way: PaymentWay.Listener });
    }
    await save.mutateAsync({
      method: row.method,
      input: {
        enabled: row.enabled,
        accounts: row.accounts.filter((each) => each.id !== account.id).map(bodyOf),
      },
    });
    onClose();
  };

  return (
    <Dialog
      open
      title={t('pmDelTitle')}
      onClose={onClose}
      actions={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('pmKeep')}
          </Button>
          <Button
            tone="danger"
            busy={save.isPending || way.isPending}
            onClick={() => {
              remove().catch(() => undefined);
            }}
          >
            {t('pmDel')}
          </Button>
        </>
      }
    >
      {account.active ? t('pmDelActive', { wallet: name }) : t('pmDelPlain')}
      {failure ? (
        <div className="mt-3">
          <Banner tone="bad">{errorText(failure)}</Banner>
        </div>
      ) : null}
    </Dialog>
  );
}
