import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { AddonKind } from '@lytronix/validators';
import { useAddons } from '@/api/addons';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, NOTE, QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { taka } from '@/lib/format';
import type { OperatorAddon } from '@/types/operator';
import { AddonPanel, RetireAddonPanel } from './addon-panel';
import { addonName, raisesWords, unitWords } from './addon-words';

type Open = { step: 'new' } | { step: 'edit' | 'retire'; addon: OperatorAddon } | null;

const KIND_TONES: Record<AddonKind, ChipTone> = {
  [AddonKind.Limit]: 'info',
  [AddonKind.Pack]: 'warn',
  [AddonKind.Feature]: 'ok',
  [AddonKind.Allowance]: 'mute',
};

/** OPERATOR-CONSOLE-DESIGN §6a: what a shop can buy on top of its plan (PLN-13). */
export function Addons(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const addons = useAddons();
  const [open, setOpen] = useState<Open>(null);
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<OperatorAddon>[] = [
    {
      key: 'item',
      label: t('addons.cItem'),
      width: 'minmax(180px,1.4fr)',
      main: true,
      cell: (addon) => (
        <>
          <div>{addonName(addon, i18n.language)}</div>
          <div className={`${CELL_NOTE} mono`}>
            {addon.key}
            {addon.retiredAt ? (
              <>
                {' · '}
                <StatusChip tone="mute" plain>
                  {t('addons.retired')}
                </StatusChip>
              </>
            ) : null}
          </div>
        </>
      ),
    },
    {
      key: 'kind',
      label: t('addons.cKind'),
      width: '110px',
      cell: (addon) => (
        <StatusChip tone={KIND_TONES[addon.kind]} plain>
          {t(`addonKinds.${addon.kind}`)}
        </StatusChip>
      ),
    },
    {
      key: 'raises',
      label: t('addons.cRaises'),
      width: 'minmax(140px,1fr)',
      cell: (addon) =>
        addon.limitKey ? (
          raisesWords(addon.limitKey, t)
        ) : (
          <span className="text-fg-muted">{raisesWords(null, t)}</span>
        ),
    },
    {
      key: 'unit',
      label: t('addons.cUnit'),
      width: '100px',
      right: true,
      cell: (addon) => <span className="tabular-nums">{unitWords(addon)}</span>,
    },
    {
      key: 'price',
      label: t('addons.cPrice'),
      width: '120px',
      right: true,
      cell: (addon) => (
        <>
          <span className="font-display font-bold tabular-nums">{taka(addon.price)}</span>
          {addon.kind === AddonKind.Pack ? null : (
            <span className="text-[12px] text-fg-muted">/{t('addons.month')}</span>
          )}
        </>
      ),
    },
    {
      key: 'running',
      label: t('addons.cRunning'),
      width: '110px',
      right: true,
      cell: (addon) => (
        <span className="tabular-nums">
          {addon.kind === AddonKind.Pack
            ? t('addons.bought', { count: addon.boughtThisMonth })
            : t('addons.running', { count: addon.running })}
        </span>
      ),
    },
    {
      key: 'acts',
      label: '',
      width: '150px',
      actions: true,
      cell: (addon) => (
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={(event) => {
              event.stopPropagation();
              setOpen({ step: 'edit', addon });
            }}
          >
            {t('common.edit')}
          </Button>
          {addon.retiredAt ? null : (
            <Button
              type="button"
              tone="ghost"
              small
              fit
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen({ step: 'retire', addon });
              }}
            >
              {t('addons.retire')}
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.addons')}
        lead={t('addons.lead')}
        actions={
          <Button
            type="button"
            small
            fit
            className="flex-[1_1_auto] sm:flex-none"
            onClick={() => {
              setOpen({ step: 'new' });
            }}
          >
            <ConsoleIcon name="plus" size={18} />
            {t('addons.new')}
          </Button>
        }
      />
      {addons.isError ? (
        <LoadFailed
          onRetry={() => {
            void addons.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={addons.data ?? []}
          rowKey={(addon) => addon.id}
          faded={(addon) => addon.retiredAt !== null}
          loading={addons.isLoading}
          onOpen={(addon) => {
            setOpen({ step: 'edit', addon });
          }}
          empty={<EmptyBox icon="inbox" title={t('addons.empty')} hint={t('addons.emptyHint')} />}
        />
      )}
      <div className={NOTE}>{t('addons.rule')}</div>
      {open?.step === 'new' ? <AddonPanel addon={null} onClose={close} /> : null}
      {open?.step === 'edit' ? (
        <AddonPanel key={open.addon.id} addon={open.addon} onClose={close} />
      ) : null}
      {open?.step === 'retire' ? <RetireAddonPanel addon={open.addon} onClose={close} /> : null}
    </ConsolePage>
  );
}
