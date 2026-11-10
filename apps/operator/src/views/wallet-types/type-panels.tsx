import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { useRemoveType, useRetireType, useUndoRetireType } from '@/api/wallet-types';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { Panel } from '@/components/ui/panel';
import { ReasonField } from '@/components/ui/reason-field';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import type { WalletType } from '@/types/manual-entries';
import { useTypeName } from './type-words';

const BOLD = { b: <b className="font-semibold" /> };

/** The shops that set it up, as many as the counts can say: switched on, or with an account saved. */
function setUp(type: WalletType): number {
  return Math.max(type.shopsOn, type.shopsWithAccounts);
}

function useSub(): (type: WalletType, on?: number) => string {
  const { t } = useTranslation();
  return (type, on = type.shopsOn) => t('walletTypes.sub', { n: on, m: type.shopsWithAccounts });
}

/** D8-65: retiring hides it from shops that never set it up; those that did keep it whole and are told. */
export function RetireTypePanel({
  type,
  onClose,
}: {
  type: WalletType;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const nameOf = useTypeName();
  const sub = useSub();
  const retire = useRetireType(type.method);
  const [reason, setReason] = useState('');
  const name = nameOf(type);
  return (
    <ActionPanel
      title={t('walletTypes.retireTitle', { c: name })}
      sub={sub(type)}
      onClose={onClose}
      actionLabel={t('walletTypes.retireButton', { c: name })}
      danger
      pending={retire.isPending}
      error={retire.isError ? errorMessage(retire.error, t) : null}
      canSubmit={reason.trim().length > 0}
      onSubmit={() => {
        retire.mutate(reason.trim(), {
          onSuccess: (answer) => {
            toast(t('walletTypes.retired', { c: name, count: answer.told }));
            onClose();
          },
        });
      }}
    >
      <Consequence>
        <Trans i18nKey="walletTypes.retireConsequence" values={{ c: name }} components={BOLD} />
      </Consequence>
      <Consequence>{t('walletTypes.retireLytro', { c: name })}</Consequence>
      <ReasonField value={reason} onChange={setReason} help={t('walletTypes.reasonHelp')} />
    </ActionPanel>
  );
}

/** Any shop can set it up again; those told it was retiring hear it's back. */
export function UndoRetireTypePanel({
  type,
  onClose,
}: {
  type: WalletType;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const nameOf = useTypeName();
  const sub = useSub();
  const undo = useUndoRetireType(type.method);
  const [reason, setReason] = useState('');
  const name = nameOf(type);
  return (
    <ActionPanel
      title={t('walletTypes.undoTitle', { c: name })}
      sub={sub(type)}
      onClose={onClose}
      actionLabel={t('walletTypes.undoButton')}
      pending={undo.isPending}
      error={undo.isError ? errorMessage(undo.error, t) : null}
      canSubmit={reason.trim().length > 0}
      onSubmit={() => {
        undo.mutate(reason.trim(), {
          onSuccess: (answer) => {
            toast(t('walletTypes.undone', { c: name, count: answer.told }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="ok">
        {t('walletTypes.undoConsequence', { c: name, count: setUp(type) })}
      </Consequence>
      <ReasonField value={reason} onChange={setReason} help={t('walletTypes.reasonHelp')} />
    </ActionPanel>
  );
}

/** One of the three things removal waits on: held in red, clear in grey. */
function Holder({
  label,
  held,
  why,
  value,
  extra,
}: {
  label: string;
  held: boolean;
  why: string;
  value: ReactNode;
  extra?: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <li
      className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
        held ? 'border-[#f3c3c6] bg-danger-soft' : 'border-line bg-neutral-50'
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-[13px] whitespace-normal text-fg-muted">
          {held ? why : t('walletTypes.blockedClear')}
        </span>
        {extra}
      </span>
      {value}
    </li>
  );
}

function Count({ value, held }: { value: number; held: boolean }): React.JSX.Element {
  return (
    <span
      className={`font-display text-[22px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums ${
        held ? 'text-danger' : 'text-success'
      }`}
    >
      {value}
    </span>
  );
}

/** D8-67: removal waits until nothing leans on it; each count says what still does. */
export function BlockedPanel({
  type,
  onClose,
}: {
  type: WalletType;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const nameOf = useTypeName();
  return (
    <Panel
      open
      title={t('walletTypes.blockedTitle', { c: nameOf(type) })}
      onClose={onClose}
      footer={
        <Button type="button" tone="outline" small fit onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <Consequence>{t('walletTypes.blockedConsequence')}</Consequence>
      <ul className="flex flex-col gap-2.5">
        <Holder
          label={t('walletTypes.cOn')}
          held={type.shopsOn > 0}
          why={t('walletTypes.blockedOn')}
          value={<Count value={type.shopsOn} held={type.shopsOn > 0} />}
        />
        <Holder
          label={t('walletTypes.cOpen')}
          held={type.openPayments > 0}
          why={t('walletTypes.blockedOpen')}
          value={<Count value={type.openPayments} held={type.openPayments > 0} />}
        />
        <Holder
          label={t('walletTypes.cLytro')}
          held={type.lytroTakes}
          why={t('walletTypes.blockedLytro')}
          value={
            <StatusChip tone={type.lytroTakes ? 'bad' : 'ok'}>
              {type.lytroTakes ? t('walletTypes.takes') : t('walletTypes.takesNot')}
            </StatusChip>
          }
          extra={
            type.lytroTakes ? (
              <span className="mt-1.5">
                <Link
                  to="/wallets"
                  className={`inline-flex items-center rounded-control border border-line-strong bg-surface font-semibold ${SMALL_BUTTON}`}
                >
                  {t('walletTypes.openMethods')}
                </Link>
              </span>
            ) : null
          }
        />
      </ul>
    </Panel>
  );
}

/** What the server's refusal says still holds the type, when its counts have moved since the list was read. */
function heldBy(error: unknown, type: WalletType): WalletType | null {
  if (!(error instanceof ApiClientError) || error.code !== 'conflict') return null;
  const { shopsOn, openPayments, lytroTakes } = error.details;
  if (typeof shopsOn !== 'number' || typeof openPayments !== 'number') return null;
  return { ...type, shopsOn, openPayments, lytroTakes: lytroTakes === true };
}

/** D8-67: removed for good; every shop's accounts for it go, past payments keep their records. */
export function RemoveTypePanel({
  type,
  onClose,
  onBlocked,
}: {
  type: WalletType;
  onClose: () => void;
  /** The server found something still holding it. */
  onBlocked: (held: WalletType) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const nameOf = useTypeName();
  const sub = useSub();
  const remove = useRemoveType(type.method);
  const [reason, setReason] = useState('');
  const name = nameOf(type);
  return (
    <ActionPanel
      title={t('walletTypes.removeTitle', { c: name })}
      sub={sub(type, 0)}
      onClose={onClose}
      actionLabel={t('walletTypes.removeButton', { c: name })}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      canSubmit={reason.trim().length > 0}
      onSubmit={() => {
        remove.mutate(reason.trim(), {
          onSuccess: () => {
            toast(t('walletTypes.removedDone', { c: name }));
            onClose();
          },
          onError: (error) => {
            const held = heldBy(error, type);
            if (held) onBlocked(held);
          },
        });
      }}
    >
      <Consequence tone="danger">
        <Trans i18nKey="walletTypes.removeConsequence" values={{ c: name }} components={BOLD} />
      </Consequence>
      <ReasonField value={reason} onChange={setReason} help={t('walletTypes.reasonHelp')} />
    </ActionPanel>
  );
}
