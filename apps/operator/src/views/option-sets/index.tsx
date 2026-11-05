import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { useDeleteOptionSet, useOptionSets, usePresets } from '@/api/catalogue';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { ConsolePage, PageTitle } from '@/components/ui/console-page';
import { DataTable, EmptyBox, type Column } from '@/components/ui/data-table';
import { LoadFailed } from '@/components/ui/load-failed';
import { QUIET_BUTTON, SMALL_BUTTON } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { TagLine, ValueTag } from '@/components/ui/value-tag';
import type { LibraryOptionSet } from '@/types/operator';
import { SetPanel } from './set-panel';

type Open = { step: 'new' } | { step: 'edit' | 'delete'; set: LibraryOptionSet } | null;

function DeletePanel({
  set,
  onClose,
}: {
  set: LibraryOptionSet;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const remove = useDeleteOptionSet();
  return (
    <ActionPanel
      title={t('optionSets.deleteTitle')}
      sub={set.name}
      onClose={onClose}
      actionLabel={t('common.delete')}
      danger
      pending={remove.isPending}
      error={remove.isError ? errorMessage(remove.error, t) : null}
      onSubmit={() => {
        remove.mutate(set.id, {
          onSuccess: () => {
            toast(t('optionSets.deleted', { name: set.name }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">{t('optionSets.deleteConsequence')}</Consequence>
    </ActionPanel>
  );
}

/** OPERATOR-CONSOLE-DESIGN §11: values a shop inserts in one tap (ATR-16). */
export function OptionSets(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const sets = useOptionSets();
  const presets = usePresets();
  const [open, setOpen] = useState<Open>(null);
  const close = (): void => {
    setOpen(null);
  };

  const columns: Column<LibraryOptionSet>[] = [
    {
      key: 'name',
      label: t('optionSets.cSet'),
      width: 'minmax(160px,1fr)',
      main: true,
      cell: (set) => set.name,
    },
    {
      key: 'options',
      label: t('optionSets.cValues'),
      width: 'minmax(240px,2.2fr)',
      cell: (set) => (
        <TagLine>
          {set.options.map((option) => (
            <ValueTag key={option} small>
              {option}
            </ValueTag>
          ))}
        </TagLine>
      ),
    },
    {
      key: 'offered',
      label: t('optionSets.cOffered'),
      width: '180px',
      cell: (set) => {
        const preset = presets.data?.find((each) => each.key === set.presetKey);
        if (!set.presetKey)
          return <span className="text-fg-muted">{t('optionSets.everyShop')}</span>;
        if (!preset) return set.presetKey;
        return i18n.language === 'bn' ? preset.labelBn : preset.labelEn;
      },
    },
    {
      key: 'acts',
      label: '',
      width: '150px',
      actions: true,
      cell: (set) => (
        <>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            onClick={() => {
              setOpen({ step: 'edit', set });
            }}
          >
            {t('common.edit')}
          </Button>
          <Button
            type="button"
            tone="ghost"
            small
            fit
            className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
            onClick={() => {
              setOpen({ step: 'delete', set });
            }}
          >
            {t('common.delete')}
          </Button>
        </>
      ),
    },
  ];

  return (
    <ConsolePage>
      <PageTitle
        title={t('nav.optionSets')}
        lead={t('optionSets.lead')}
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
            {t('optionSets.new')}
          </Button>
        }
      />
      {sets.isError ? (
        <LoadFailed
          onRetry={() => {
            void sets.refetch();
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          rows={sets.data ?? []}
          rowKey={(set) => set.id}
          loading={sets.isLoading}
          empty={
            <EmptyBox
              icon="layers"
              title={t('optionSets.empty')}
              hint={t('optionSets.emptyHint')}
            />
          }
        />
      )}
      {open?.step === 'new' ? (
        <SetPanel set={null} presets={presets.data ?? []} onClose={close} />
      ) : null}
      {open?.step === 'edit' ? (
        <SetPanel set={open.set} presets={presets.data ?? []} onClose={close} />
      ) : null}
      {open?.step === 'delete' ? <DeletePanel set={open.set} onClose={close} /> : null}
    </ConsolePage>
  );
}
