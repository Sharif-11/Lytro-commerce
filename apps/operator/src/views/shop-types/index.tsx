import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { useAttributes, usePresets } from '@/api/catalogue';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { CELL_NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import type { ShopTypePreset } from '@/types/operator';
import { PresetPanel } from './preset-panel';

/** OPERATOR-CONSOLE-DESIGN §11: what a new product starts with in a shop of each type. */
export function ShopTypes(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const presets = usePresets();
  const attributes = useAttributes();
  const [editing, setEditing] = useState<ShopTypePreset | null>(null);
  const bangla = i18n.language === 'bn';

  const columns: Column<ShopTypePreset>[] = [
    {
      key: 'type',
      label: t('shopTypes.cType'),
      width: 'minmax(170px,1.3fr)',
      main: true,
      cell: (preset) => (
        <>
          <div>{bangla ? preset.labelBn : preset.labelEn}</div>
          <div className={CELL_NOTE}>
            {bangla ? preset.labelEn : preset.labelBn} ·{' '}
            <span className="mono text-[11px]">{preset.key}</span>
          </div>
        </>
      ),
    },
    {
      key: 'unit',
      label: t('shopTypes.cUnit'),
      width: '70px',
      cell: (preset) => t(`shopTypes.units.${preset.defaults.stockUnit}`),
    },
    {
      key: 'tracking',
      label: t('shopTypes.cTracking'),
      width: '110px',
      cell: (preset) => t(`shopTypes.trackings.${preset.defaults.stockTracking}`),
    },
    {
      key: 'batch',
      label: t('shopTypes.cBatch'),
      width: '70px',
      cell: (preset) =>
        preset.defaults.batchTracked ? (
          <span role="img" aria-label={t('common.on')}>
            <ConsoleIcon name="check" size={18} />
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'serial',
      label: t('shopTypes.cSerial'),
      width: '80px',
      cell: (preset) =>
        preset.defaults.serialTracked
          ? t(`shopTypes.formats.${preset.defaults.serialFormat}`)
          : '—',
    },
    {
      key: 'low',
      label: t('shopTypes.cLow'),
      width: '80px',
      right: true,
      cell: (preset) => (
        <span className="tabular-nums">{Number(preset.defaults.lowStockThreshold)}</span>
      ),
    },
    {
      key: 'suggested',
      label: t('shopTypes.cSuggested'),
      width: '150px',
      cell: (preset) =>
        `${t('shopTypes.categories', { count: preset.defaults.suggestedCategories.length })} · ${t(
          'shopTypes.attributes',
          { count: preset.defaults.suggestedAttributeIds.length },
        )}`,
    },
    {
      key: 'upFront',
      label: t('shopTypes.cUpFront'),
      width: '80px',
      cell: (preset) => t('shopTypes.fieldCount', { count: preset.defaults.upFrontFields.length }),
    },
    {
      key: 'acts',
      label: '',
      width: '70px',
      actions: true,
      cell: (preset) => (
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={SMALL_BUTTON}
          onClick={(event) => {
            event.stopPropagation();
            setEditing(preset);
          }}
        >
          {t('common.edit')}
        </Button>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle title={t('nav.shopTypes')} lead={t('shopTypes.lead')} />
      {presets.isError ? (
        <LoadFailed
          onRetry={() => {
            void presets.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={presets.data ?? []}
          rowKey={(preset) => preset.key}
          loading={presets.isLoading}
          onOpen={setEditing}
          empty={
            <EmptyBox icon="store" title={t('shopTypes.empty')} hint={t('shopTypes.emptyHint')} />
          }
        />
      )}
      {editing ? (
        <PresetPanel
          key={editing.key}
          preset={editing}
          attributes={attributes.data ?? []}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
