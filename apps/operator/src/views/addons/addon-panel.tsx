import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { SelectField, TextField } from '@lytronix/ui';
import { AddonKind } from '@lytronix/validators';
import { useCreateAddon, useRetireAddon, useUpdateAddon } from '@/api/addons';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { MoneyField } from '@/components/ui/money-field';
import { TWO_FIELDS } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { enumValue } from '@/lib/enum-value';
import { problemsOf } from '@/lib/form-problems';
import { limitLabelKey } from '@/lib/limit-keys';
import type { OperatorAddon } from '@/types/operator';
import { addonName } from './addon-words';

const FIELDS = ['key', 'unitSize', 'price', 'labelEn', 'labelBn'];
// The limits a shop runs out of, as drawn. An item on another keeps it.
const RAISABLE = [
  'products',
  'staff',
  'storage_mb',
  'bandwidth_gb',
  'requests_monthly',
  'orders_handled_monthly',
];

/**
 * OPERATOR-CONSOLE-DESIGN §6a. The server fixes an item's key, kind and limit when it is made, and takes retiring as its
 * own step, so the panel shows them without letting them change.
 */
export function AddonPanel({
  addon,
  onClose,
}: {
  addon: OperatorAddon | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const create = useCreateAddon();
  const update = useUpdateAddon();
  const [key, setKey] = useState(addon?.key ?? '');
  const [labelEn, setLabelEn] = useState(addon?.labelEn ?? '');
  const [labelBn, setLabelBn] = useState(addon?.labelBn ?? '');
  const [kind, setKind] = useState<AddonKind>(addon?.kind ?? AddonKind.Limit);
  const [limitKey, setLimitKey] = useState(addon?.limitKey ?? 'products');
  const [unitSize, setUnitSize] = useState(addon?.unitSize ? String(addon.unitSize) : '');
  const [price, setPrice] = useState(addon ? String(Number(addon.price)) : '');
  const saving = addon ? update : create;
  const problems = problemsOf(saving.error, t, FIELDS);
  const raises = kind === AddonKind.Limit || kind === AddonKind.Pack;
  const limits = RAISABLE.includes(limitKey) ? RAISABLE : [limitKey, ...RAISABLE];

  function submit(): void {
    const names = { labelEn: labelEn.trim(), labelBn: labelBn.trim() };
    const onSuccess = (): void => {
      toast(
        t(addon ? 'addons.saved' : 'addons.created', { name: addonName(names, i18n.language) }),
      );
      onClose();
    };
    if (addon) {
      update.mutate(
        {
          id: addon.id,
          ...names,
          price: Number(price),
          unitSize: raises ? Number(unitSize) : undefined,
        },
        { onSuccess },
      );
      return;
    }
    create.mutate(
      {
        ...names,
        key: key.trim(),
        kind,
        limitKey: raises ? limitKey : null,
        unitSize: raises ? Number(unitSize) : null,
        price: Number(price),
      },
      { onSuccess },
    );
  }

  return (
    <ActionPanel
      title={
        addon
          ? t('addons.editTitle', { name: addonName(addon, i18n.language) })
          : t('addons.newTitle')
      }
      sub={addon ? `${addon.key} · ${t('addons.running', { count: addon.running })}` : undefined}
      onClose={onClose}
      actionLabel={t('common.save')}
      pending={saving.isPending}
      canSubmit={
        labelEn.trim() !== '' &&
        labelBn.trim() !== '' &&
        price.trim() !== '' &&
        (addon !== null || key.trim() !== '') &&
        (!raises || unitSize.trim() !== '')
      }
      error={problems.banner}
      onSubmit={submit}
    >
      {addon ? <Consequence>{t('addons.consequence')}</Consequence> : null}
      <div className={TWO_FIELDS}>
        <TextField
          label={t('addons.nameEn')}
          name="labelEn"
          required
          maxLength={100}
          data-autofocus
          error={problems.field('labelEn')}
          value={labelEn}
          onChange={(event) => {
            setLabelEn(event.target.value);
          }}
        />
        <TextField
          label={t('addons.nameBn')}
          name="labelBn"
          required
          maxLength={100}
          error={problems.field('labelBn')}
          value={labelBn}
          onChange={(event) => {
            setLabelBn(event.target.value);
          }}
        />
      </div>
      {addon ? null : (
        <TextField
          label={t('addons.key')}
          name="key"
          required
          mono
          maxLength={50}
          hint={t('addons.keyHelp')}
          error={problems.field('key')}
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
          }}
        />
      )}
      <div className={TWO_FIELDS}>
        <SelectField
          label={t('addons.kind')}
          name="kind"
          disabled={addon !== null}
          value={kind}
          onChange={(event) => {
            setKind(enumValue(Object.values(AddonKind), event.target.value, kind));
          }}
        >
          <option value={AddonKind.Limit}>{t('addonKinds.limit')}</option>
          <option value={AddonKind.Pack}>{t('addonKinds.pack')}</option>
          <option value={AddonKind.Feature}>{t('addonKinds.feature')}</option>
          <option value={AddonKind.Allowance} disabled>
            {t('addonKinds.allowance')} · {t('shell.soon')}
          </option>
        </SelectField>
        <SelectField
          label={t('addons.limit')}
          name="limitKey"
          disabled={addon !== null || !raises}
          value={limitKey}
          onChange={(event) => {
            setLimitKey(event.target.value);
          }}
        >
          {limits.map((each) => (
            <option key={each} value={each}>
              {t(limitLabelKey(each))}
            </option>
          ))}
        </SelectField>
      </div>
      <div className={TWO_FIELDS}>
        <TextField
          label={t('addons.unitSize')}
          name="unitSize"
          mono
          inputMode="numeric"
          placeholder="500"
          disabled={!raises}
          required={raises}
          hint={t('addons.unitHelp')}
          error={problems.field('unitSize')}
          value={raises ? unitSize : ''}
          onChange={(event) => {
            setUnitSize(event.target.value);
          }}
        />
        <MoneyField
          label={t('addons.price')}
          name="price"
          startHere={false}
          hint={t('addons.priceHelp')}
          error={problems.field('price')}
          value={price}
          onChange={setPrice}
        />
      </div>
    </ActionPanel>
  );
}

export function RetireAddonPanel({
  addon,
  onClose,
}: {
  addon: OperatorAddon;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const retire = useRetireAddon();
  const name = addonName(addon, i18n.language);
  return (
    <ActionPanel
      title={t('addons.retireTitle', { name })}
      sub={addon.key}
      onClose={onClose}
      actionLabel={t('addons.retire')}
      danger
      pending={retire.isPending}
      error={retire.isError ? errorMessage(retire.error, t) : null}
      onSubmit={() => {
        retire.mutate(addon.id, {
          onSuccess: () => {
            toast(t('addons.retiredToast', { name }));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">
        {t('addons.retireConsequence', { count: addon.running })}
      </Consequence>
    </ActionPanel>
  );
}
