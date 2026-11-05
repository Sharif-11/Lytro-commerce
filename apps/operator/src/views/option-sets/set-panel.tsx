import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SelectField, TextArea, TextField } from '@lytronix/ui';
import { useCreateOptionSet, useUpdateOptionSet } from '@/api/catalogue';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { useToast } from '@/components/ui/use-toast';
import { problemsOf } from '@/lib/form-problems';
import type { LibraryOptionSet, ShopTypePreset } from '@/types/operator';

/** OPERATOR-CONSOLE-DESIGN §11: a set's name, its values one to a line, and who is offered it first (ATR-16). */
export function SetPanel({
  set,
  presets,
  onClose,
}: {
  set: LibraryOptionSet | null;
  presets: readonly ShopTypePreset[];
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const create = useCreateOptionSet();
  const update = useUpdateOptionSet();
  const [name, setName] = useState(set?.name ?? '');
  const [values, setValues] = useState(set?.options.join('\n') ?? '');
  const [presetKey, setPresetKey] = useState(set?.presetKey ?? '');
  const saving = set ? update : create;
  const problems = problemsOf(saving.error, t, ['name', 'options']);
  const options = values
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return (
    <ActionPanel
      title={set ? t('optionSets.editTitle') : t('optionSets.newTitle')}
      sub={set?.name}
      onClose={onClose}
      actionLabel={set ? t('common.save') : t('optionSets.create')}
      pending={saving.isPending}
      canSubmit={name.trim() !== '' && options.length > 0}
      error={problems.banner}
      onSubmit={() => {
        const input = {
          name: name.trim(),
          options,
          presetKey: presetKey === '' ? null : presetKey,
        };
        const onSuccess = (): void => {
          toast(t(set ? 'optionSets.saved' : 'optionSets.created', { name: input.name }));
          onClose();
        };
        if (set) update.mutate({ id: set.id, ...input }, { onSuccess });
        else create.mutate(input, { onSuccess });
      }}
    >
      {set ? <Consequence>{t('optionSets.consequence')}</Consequence> : null}
      <TextField
        label={t('optionSets.name')}
        name="name"
        required
        data-autofocus
        error={problems.field('name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <TextArea
        label={t('optionSets.values')}
        name="options"
        required
        error={problems.field('options')}
        value={values}
        onChange={(event) => {
          setValues(event.target.value);
        }}
      />
      <SelectField
        label={t('optionSets.type')}
        name="presetKey"
        value={presetKey}
        onChange={(event) => {
          setPresetKey(event.target.value);
        }}
      >
        <option value="">{t('optionSets.everyShop')}</option>
        {presets.map((preset) => (
          <option key={preset.key} value={preset.key}>
            {i18n.language === 'bn' ? preset.labelBn : preset.labelEn}
          </option>
        ))}
      </SelectField>
    </ActionPanel>
  );
}
