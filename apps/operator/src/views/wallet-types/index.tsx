import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { PaymentMethod, RetireState } from '@lytronix/validators';
import { useWalletTypes } from '@/api/wallet-types';
import { Banner } from '@/components/ui/banner';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { formatDay } from '@/lib/format';
import type { WalletType } from '@/types/manual-entries';
import { providerColour } from '@/views/wallets/providers';
import { BlockedPanel, RemoveTypePanel, RetireTypePanel, UndoRetireTypePanel } from './type-panels';
import { holdsType, useTypeName } from './type-words';

type Open = { step: 'retire' | 'undo' | 'remove' | 'blocked'; type: WalletType } | null;

const STATE_TONES: Record<RetireState, ChipTone> = {
  [RetireState.Active]: 'ok',
  [RetireState.Retiring]: 'warn',
  [RetireState.Removed]: 'mute',
};

const BOLD = { b: <b className="font-semibold" /> };

/** A count as the sketch writes it: 1,342. */
function count(value: number): string {
  return value.toLocaleString('en-US');
}

/** A cell's second line. */
function SubLine({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="text-[13px] font-normal whitespace-normal text-fg-muted">{children}</div>;
}

/**
 * OPERATOR-CONSOLE-DESIGN v7 §10d (WAL-18, D8-65 to D8-67): the payment methods shops can take from their customers, retired,
 * brought back and removed the couriers' way. Kept apart from Lytro's own payment methods, which a link names.
 */
export function WalletTypes(): React.JSX.Element {
  const { t } = useTranslation();
  const types = useWalletTypes();
  const nameOf = useTypeName();
  const [open, setOpen] = useState<Open>(null);
  const all = types.data ?? [];
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<WalletType>[] = [
    {
      key: 'type',
      label: t('walletTypes.cType'),
      width: 'minmax(130px,1.5fr)',
      main: true,
      cell: (type) => (
        <>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 flex-none rounded-full"
              style={{
                background:
                  type.method === PaymentMethod.Bank
                    ? 'var(--color-neutral-700)'
                    : providerColour(nameOf(type)),
              }}
            />
            <span>
              {nameOf(type)} <span className={`mono ${CELL_NOTE}`}>{type.method}</span>
            </span>
          </div>
          {type.state === RetireState.Retiring && type.retiringSince ? (
            <SubLine>{t('walletTypes.retiringLine', { d: formatDay(type.retiringSince) })}</SubLine>
          ) : null}
          {type.state === RetireState.Removed && type.removedAt ? (
            <SubLine>{t('walletTypes.removedLine', { d: formatDay(type.removedAt) })}</SubLine>
          ) : null}
          {type.state === RetireState.Removed ? null : (
            <SubLine>{t('walletTypes.accounts', { count: type.shopsWithAccounts })}</SubLine>
          )}
        </>
      ),
    },
    {
      key: 'state',
      label: t('walletTypes.cStatus'),
      width: '100px',
      cell: (type) => (
        <StatusChip tone={STATE_TONES[type.state]}>{t(`walletTypes.${type.state}`)}</StatusChip>
      ),
    },
    {
      key: 'on',
      label: t('walletTypes.cOn'),
      width: '84px',
      right: true,
      cell: (type) => (
        <span className="tabular-nums">
          {type.state === RetireState.Removed ? 0 : count(type.shopsOn)}
        </span>
      ),
    },
    {
      key: 'open',
      label: t('walletTypes.cOpen'),
      width: '84px',
      right: true,
      cell: (type) => (
        <span className="tabular-nums">
          {type.state === RetireState.Removed ? 0 : count(type.openPayments)}
        </span>
      ),
    },
    {
      key: 'lytro',
      label: t('walletTypes.cLytro'),
      width: '90px',
      cell: (type) => {
        if (type.state === RetireState.Removed) return '—';
        return type.lytroTakes ? (
          <StatusChip tone="ok" plain>
            {t('walletTypes.takes')}
          </StatusChip>
        ) : (
          <span className="text-fg-muted">{t('walletTypes.takesNot')}</span>
        );
      },
    },
    {
      key: 'acts',
      label: '',
      width: '180px',
      actions: true,
      cell: (type) => {
        if (type.state === RetireState.Removed) return null;
        if (type.state === RetireState.Active) {
          return (
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={() => {
                setOpen({ step: 'retire', type });
              }}
            >
              {t('walletTypes.retire')}
            </Button>
          );
        }
        return (
          <>
            <Button
              type="button"
              tone="outline"
              small
              fit
              className={SMALL_BUTTON}
              onClick={() => {
                setOpen({ step: 'undo', type });
              }}
            >
              {t('walletTypes.undo')}
            </Button>
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={() => {
                setOpen({ step: holdsType(type) ? 'blocked' : 'remove', type });
              }}
            >
              {t('walletTypes.remove')}
            </Button>
          </>
        );
      },
    },
  ];

  const retiring = all.filter((each) => each.state === RetireState.Retiring);

  return (
    <ConsolePage>
      <PageTitle title={t('nav.walletTypes')} lead={t('walletTypes.lead')} />
      <div className={NOTE}>
        {t('walletTypes.lytroNote')}{' '}
        <Link to="/wallets" className="font-medium text-primary underline">
          {t('nav.wallets')}
        </Link>
      </div>
      {types.isError ? (
        <LoadFailed
          onRetry={() => {
            void types.refetch();
          }}
        />
      ) : (
        <>
          {retiring.map((type) => (
            <Banner key={type.method} tone="warn" icon="warn">
              <Trans i18nKey="walletTypes.banner" values={{ c: nameOf(type) }} components={BOLD} />
            </Banner>
          ))}
          <DataTable
            columns={columns}
            rows={all}
            rowKey={(type) => type.method}
            loading={types.isPending}
            faded={(type) => type.state === RetireState.Removed}
            empty={
              <EmptyBox icon="cards" title={t('nav.walletTypes')} hint={t('walletTypes.lead')} />
            }
          />
        </>
      )}
      {open?.step === 'retire' ? <RetireTypePanel type={open.type} onClose={close} /> : null}
      {open?.step === 'undo' ? <UndoRetireTypePanel type={open.type} onClose={close} /> : null}
      {open?.step === 'blocked' ? <BlockedPanel type={open.type} onClose={close} /> : null}
      {open?.step === 'remove' ? (
        <RemoveTypePanel
          type={open.type}
          onClose={close}
          onBlocked={(held) => {
            setOpen({ step: 'blocked', type: held });
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
