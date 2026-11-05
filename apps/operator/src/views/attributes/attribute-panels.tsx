import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, SelectField, TextField } from '@lytronix/ui';
import { AttributeDataType, UnitKind } from '@lytronix/validators';
import {
  useAddOption,
  useCreateAttribute,
  useUpdateAttribute,
  useUpdateOption,
} from '@/api/catalogue';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Consequence } from '@/components/ui/consequence';
import { Panel } from '@/components/ui/panel';
import { NOTE, QUIET_BUTTON, SMALL_BUTTON, TWO_FIELDS } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { Swatch } from '@/components/ui/value-tag';
import { enumValue } from '@/lib/enum-value';
import { problemsOf } from '@/lib/form-problems';
import type { LibraryAttribute, LibraryOption } from '@/types/operator';
import { hasValues } from './attribute-types';

/** ATL-01: a new platform attribute. Its type never changes afterwards, so it is said before it is chosen. */
export function NewAttributePanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateAttribute();
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<AttributeDataType>(AttributeDataType.EnumSingle);
  const [unitKind, setUnitKind] = useState<UnitKind>(UnitKind.Weight);
  const problems = problemsOf(create.error, t, ['name']);
  const measured = dataType === AttributeDataType.NumberWithUnit;
  return (
    <ActionPanel
      title={t('attributes.newTitle')}
      onClose={onClose}
      actionLabel={t('attributes.create')}
      pending={create.isPending}
      canSubmit={name.trim() !== ''}
      error={problems.banner}
      onSubmit={() => {
        create.mutate(
          { name: name.trim(), dataType, unitKind: measured ? unitKind : undefined },
          {
            onSuccess: () => {
              toast(t('attributes.created', { name: name.trim() }));
              onClose();
            },
          },
        );
      }}
    >
      <Consequence>{t('attributes.consequence')}</Consequence>
      <TextField
        label={t('attributes.name')}
        name="name"
        required
        maxLength={80}
        placeholder={t('attributes.namePlaceholder')}
        data-autofocus
        error={problems.field('name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <div className={TWO_FIELDS}>
        <SelectField
          label={t('attributes.dataType')}
          name="dataType"
          value={dataType}
          onChange={(event) => {
            setDataType(enumValue(Object.values(AttributeDataType), event.target.value, dataType));
          }}
        >
          {Object.values(AttributeDataType).map((each) => (
            <option key={each} value={each}>
              {t(`attributes.types.${each}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('attributes.unitKind')}
          name="unitKind"
          disabled={!measured}
          value={measured ? unitKind : ''}
          onChange={(event) => {
            setUnitKind(enumValue(Object.values(UnitKind), event.target.value, unitKind));
          }}
        >
          {measured ? null : <option value="">—</option>}
          {Object.values(UnitKind).map((each) => (
            <option key={each} value={each}>
              {t(`attributes.unitKinds.${each}`)}
            </option>
          ))}
        </SelectField>
      </div>
    </ActionPanel>
  );
}

/** The attribute's own panel: its name, whether it is offered, and its values. */
export function AttributePanel({
  attribute,
  onClose,
  onRename,
  onRetire,
  onBringBack,
  bringingBack,
  backError,
  onAddValue,
  onEditValue,
  onRetireValue,
  onBringBackValue,
}: {
  attribute: LibraryAttribute;
  onClose: () => void;
  onRename: () => void;
  onRetire: () => void;
  onBringBack: () => void;
  bringingBack: boolean;
  backError: string | null;
  onAddValue: () => void;
  onEditValue: (option: LibraryOption) => void;
  onRetireValue: (option: LibraryOption) => void;
  onBringBackValue: (option: LibraryOption) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Panel
      open
      title={attribute.name}
      sub={t(`attributes.types.${attribute.dataType}`)}
      onClose={onClose}
      footerInRow
      footer={
        <Button
          type="button"
          tone="outline"
          small
          fit
          className="flex-1 sm:flex-none"
          onClick={onClose}
        >
          {t('common.close')}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" tone="outline" small fit className={SMALL_BUTTON} onClick={onRename}>
          <ConsoleIcon name="edit" size={16} />
          {t('attributes.rename')}
        </Button>
        {attribute.retired ? (
          <Button
            type="button"
            tone="ghost"
            small
            fit
            loading={bringingBack}
            className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
            onClick={onBringBack}
          >
            {t('attributes.bringBack')}
          </Button>
        ) : (
          <Button
            type="button"
            tone="ghost"
            small
            fit
            className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
            onClick={onRetire}
          >
            {t('attributes.retire')}
          </Button>
        )}
      </div>
      {backError ? <div className="text-[13px] text-danger-text">{backError}</div> : null}
      <div className={NOTE}>{t('attributes.retireNote')}</div>
      {hasValues(attribute) ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold">{t('attributes.values')}</h3>
            <button
              type="button"
              onClick={onAddValue}
              className="inline-flex items-center gap-1 text-[14px] font-medium text-primary"
            >
              <ConsoleIcon name="plus" size={16} />
              {t('attributes.addValue')}
            </button>
          </div>
          <div className="flex flex-col rounded-lg border border-line">
            {attribute.options.map((option) => (
              <div
                key={option.id}
                className="flex min-h-11 flex-wrap items-center gap-2 border-t border-line px-3 py-1.5 first:border-t-0"
              >
                <span
                  className={`min-w-0 flex-1 text-[14px] font-medium ${
                    option.retired ? 'text-fg-muted line-through' : ''
                  }`}
                >
                  {option.swatchColor ? <Swatch color={option.swatchColor} /> : null}
                  {option.value}
                </span>
                {option.retired ? (
                  <StatusChip tone="mute" plain>
                    {t('attributes.retired')}
                  </StatusChip>
                ) : (
                  <Button
                    type="button"
                    tone="ghost"
                    small
                    fit
                    className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
                    aria-label={`${t('attributes.rename')}: ${option.value}`}
                    onClick={() => {
                      onEditValue(option);
                    }}
                  >
                    {t('attributes.rename')}
                  </Button>
                )}
                <Button
                  type="button"
                  tone="ghost"
                  small
                  fit
                  className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
                  aria-label={`${t(
                    option.retired ? 'attributes.bringBack' : 'attributes.retire',
                  )}: ${option.value}`}
                  onClick={() => {
                    if (option.retired) onBringBackValue(option);
                    else onRetireValue(option);
                  }}
                >
                  {t(option.retired ? 'attributes.bringBack' : 'attributes.retire')}
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

export function RenameAttributePanel({
  attribute,
  onClose,
  onCancel,
}: {
  attribute: LibraryAttribute;
  onClose: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateAttribute();
  const [name, setName] = useState(attribute.name);
  const problems = problemsOf(update.error, t, ['name']);
  return (
    <ActionPanel
      title={t('attributes.renameTitle')}
      sub={attribute.name}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={t('common.save')}
      pending={update.isPending}
      canSubmit={name.trim() !== ''}
      error={problems.banner}
      onSubmit={() => {
        update.mutate(
          { id: attribute.id, name: name.trim() },
          {
            onSuccess: () => {
              toast(t('attributes.renamed', { name: name.trim() }));
              onCancel();
            },
          },
        );
      }}
    >
      <TextField
        label={t('attributes.name')}
        name="name"
        required
        maxLength={80}
        data-autofocus
        error={problems.field('name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
    </ActionPanel>
  );
}

export function RetireAttributePanel({
  attribute,
  onClose,
  onCancel,
}: {
  attribute: LibraryAttribute;
  onClose: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateAttribute();
  return (
    <ActionPanel
      title={t('attributes.retireTitle', { name: attribute.name })}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={t('attributes.retire')}
      danger
      pending={update.isPending}
      error={update.isError ? errorMessage(update.error, t) : null}
      onSubmit={() => {
        update.mutate(
          { id: attribute.id, retired: true },
          {
            onSuccess: () => {
              toast(t('attributes.retiredToast', { name: attribute.name }));
              onCancel();
            },
          },
        );
      }}
    >
      <Consequence tone="danger">{t('attributes.retireNote')}</Consequence>
    </ActionPanel>
  );
}

/** ATR-18: a platform value, with its colour if it has one. One panel to add one, or to rename and re-colour it. */
export function ValuePanel({
  attribute,
  option,
  onClose,
  onCancel,
}: {
  attribute: LibraryAttribute;
  option: LibraryOption | null;
  onClose: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const add = useAddOption();
  const update = useUpdateOption();
  const [value, setValue] = useState(option?.value ?? '');
  const [swatch, setSwatch] = useState(option?.swatchColor ?? '');
  const saving = option ? update : add;
  const problems = problemsOf(saving.error, t, ['value', 'swatchColor']);
  const colour = swatch.trim();
  const shown = /^#[0-9A-Fa-f]{6}$/.test(colour) ? colour : null;
  return (
    <ActionPanel
      title={option ? t('attributes.renameValueTitle') : t('attributes.addValue')}
      sub={attribute.name}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={option ? t('common.save') : t('attributes.addValue')}
      pending={saving.isPending}
      canSubmit={value.trim() !== ''}
      error={problems.banner}
      onSubmit={() => {
        const words = value.trim();
        const onSuccess = (): void => {
          toast(t(option ? 'attributes.valueSaved' : 'attributes.valueAdded', { value: words }));
          onCancel();
        };
        if (option) {
          update.mutate(
            {
              attributeId: attribute.id,
              optionId: option.id,
              value: words,
              swatchColor: colour === '' ? null : colour,
            },
            { onSuccess },
          );
        } else {
          add.mutate(
            {
              attributeId: attribute.id,
              value: words,
              swatchColor: colour === '' ? undefined : colour,
            },
            { onSuccess },
          );
        }
      }}
    >
      <TextField
        label={t('attributes.value')}
        name="value"
        required
        placeholder={t('attributes.valuePlaceholder')}
        data-autofocus
        error={problems.field('value')}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <TextField
        label={t('attributes.swatch')}
        name="swatch"
        mono
        placeholder="#RRGGBB"
        leading={shown ? <Swatch color={shown} size={20} /> : undefined}
        error={problems.field('swatchColor')}
        value={swatch}
        onChange={(event) => {
          setSwatch(event.target.value);
        }}
      />
    </ActionPanel>
  );
}

export function RetireValuePanel({
  attribute,
  option,
  onClose,
  onCancel,
}: {
  attribute: LibraryAttribute;
  option: LibraryOption;
  onClose: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const update = useUpdateOption();
  return (
    <ActionPanel
      title={t('attributes.retireTitle', { name: option.value })}
      sub={attribute.name}
      onClose={onClose}
      onCancel={onCancel}
      actionLabel={t('attributes.retire')}
      danger
      pending={update.isPending}
      error={update.isError ? errorMessage(update.error, t) : null}
      onSubmit={() => {
        update.mutate(
          { attributeId: attribute.id, optionId: option.id, retired: true },
          {
            onSuccess: () => {
              toast(t('attributes.valueRetired', { value: option.value }));
              onCancel();
            },
          },
        );
      }}
    >
      <Consequence tone="danger">{t('attributes.retireNote')}</Consequence>
    </ActionPanel>
  );
}
