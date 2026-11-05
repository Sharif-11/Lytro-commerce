import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { useAttributes, useUpdateAttribute, useUpdateOption } from '@/api/catalogue';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { SMALL_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { Swatch, TagLine, ValueTag } from '@/components/ui/value-tag';
import type { LibraryAttribute, LibraryOption } from '@/types/operator';
import {
  AttributePanel,
  NewAttributePanel,
  RenameAttributePanel,
  RetireAttributePanel,
  RetireValuePanel,
  ValuePanel,
} from './attribute-panels';

const CHIPS_SHOWN = 6;

type Open =
  | { step: 'new' }
  | { step: 'open' | 'rename' | 'retire' | 'add-value'; id: string }
  | { step: 'edit-value' | 'retire-value'; id: string; option: LibraryOption }
  | null;

/** OPERATOR-CONSOLE-DESIGN §11: the attributes every shop sees, with their platform values (ATL-01). */
export function Attributes(): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const attributes = useAttributes();
  const updateAttribute = useUpdateAttribute();
  const updateOption = useUpdateOption();
  const [open, setOpen] = useState<Open>(null);
  const rows = attributes.data ?? [];
  const chosen = open && open.step !== 'new' ? rows.find((row) => row.id === open.id) : undefined;
  const close = (): void => {
    setOpen(null);
  };
  const backToIt = (): void => {
    if (chosen) setOpen({ step: 'open', id: chosen.id });
  };

  const columns: Column<LibraryAttribute>[] = [
    {
      key: 'name',
      label: t('attributes.name'),
      width: 'minmax(160px,1.2fr)',
      main: true,
      cell: (attribute) => (
        <>
          {attribute.name}{' '}
          {attribute.retired ? (
            <StatusChip tone="mute" plain>
              {t('attributes.retired')}
            </StatusChip>
          ) : null}
        </>
      ),
    },
    {
      key: 'type',
      label: t('attributes.cType'),
      width: '110px',
      cell: (attribute) => t(`attributes.types.${attribute.dataType}`),
    },
    {
      key: 'unit',
      label: t('attributes.cUnit'),
      width: '110px',
      cell: (attribute) =>
        attribute.unitKind ? t(`attributes.unitKinds.${attribute.unitKind}`) : '—',
    },
    {
      key: 'values',
      label: t('attributes.cValues'),
      width: 'minmax(200px,2fr)',
      cell: (attribute) =>
        attribute.options.length > 0 ? (
          <TagLine>
            {attribute.options.slice(0, CHIPS_SHOWN).map((option) => (
              <ValueTag key={option.id} small tone={option.retired ? 'strike' : 'plain'}>
                {option.swatchColor ? <Swatch color={option.swatchColor} /> : null}
                {option.value}
              </ValueTag>
            ))}
            {attribute.options.length > CHIPS_SHOWN ? (
              <ValueTag small>+{attribute.options.length - CHIPS_SHOWN}</ValueTag>
            ) : null}
          </TagLine>
        ) : (
          '—'
        ),
    },
    {
      key: 'acts',
      label: '',
      width: '80px',
      actions: true,
      cell: (attribute) => (
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={SMALL_BUTTON}
          aria-label={`${t('attributes.open')}: ${attribute.name}`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen({ step: 'open', id: attribute.id });
          }}
        >
          {t('attributes.open')}
        </Button>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.attributes')}
        lead={t('attributes.lead')}
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
            {t('attributes.new')}
          </Button>
        }
      />
      {attributes.isError ? (
        <LoadFailed
          onRetry={() => {
            void attributes.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(attribute) => attribute.id}
          faded={(attribute) => attribute.retired}
          loading={attributes.isLoading}
          onOpen={(attribute) => {
            setOpen({ step: 'open', id: attribute.id });
          }}
          empty={
            <EmptyBox icon="list" title={t('attributes.empty')} hint={t('attributes.emptyHint')} />
          }
        />
      )}
      {open?.step === 'new' ? <NewAttributePanel onClose={close} /> : null}
      {open?.step === 'open' && chosen ? (
        <AttributePanel
          attribute={chosen}
          onClose={close}
          onRename={() => {
            setOpen({ step: 'rename', id: chosen.id });
          }}
          onRetire={() => {
            setOpen({ step: 'retire', id: chosen.id });
          }}
          onBringBack={() => {
            updateAttribute.mutate(
              { id: chosen.id, retired: false },
              {
                onSuccess: () => {
                  toast(t('attributes.broughtBack', { name: chosen.name }));
                },
              },
            );
          }}
          bringingBack={updateAttribute.isPending}
          backError={
            updateAttribute.isError
              ? errorMessage(updateAttribute.error, t)
              : updateOption.isError
                ? errorMessage(updateOption.error, t)
                : null
          }
          onAddValue={() => {
            setOpen({ step: 'add-value', id: chosen.id });
          }}
          onEditValue={(option) => {
            setOpen({ step: 'edit-value', id: chosen.id, option });
          }}
          onRetireValue={(option) => {
            setOpen({ step: 'retire-value', id: chosen.id, option });
          }}
          onBringBackValue={(option) => {
            updateOption.mutate(
              { attributeId: chosen.id, optionId: option.id, retired: false },
              {
                onSuccess: () => {
                  toast(t('attributes.valueBack', { value: option.value }));
                },
              },
            );
          }}
        />
      ) : null}
      {open?.step === 'rename' && chosen ? (
        <RenameAttributePanel attribute={chosen} onClose={close} onCancel={backToIt} />
      ) : null}
      {open?.step === 'retire' && chosen ? (
        <RetireAttributePanel attribute={chosen} onClose={close} onCancel={backToIt} />
      ) : null}
      {open?.step === 'add-value' && chosen ? (
        <ValuePanel attribute={chosen} option={null} onClose={close} onCancel={backToIt} />
      ) : null}
      {open?.step === 'edit-value' && chosen ? (
        <ValuePanel attribute={chosen} option={open.option} onClose={close} onCancel={backToIt} />
      ) : null}
      {open?.step === 'retire-value' && chosen ? (
        <RetireValuePanel
          attribute={chosen}
          option={open.option}
          onClose={close}
          onCancel={backToIt}
        />
      ) : null}
    </ConsolePage>
  );
}
