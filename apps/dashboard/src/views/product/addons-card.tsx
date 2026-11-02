import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import {
  MODIFIER_GROUPS_MAX,
  MODIFIER_NAME_MAX_LENGTH,
  MODIFIER_OPTIONS_MAX,
} from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { RadioMark } from '@/components/ui/kv';
import { SectionHead } from '@/components/ui/page';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  groupProblem,
  priceChangeOf,
  ruleOf,
  rulesFor,
  type AddOnGroup,
  type AddOnOption,
  type AddOnRule,
} from '@/lib/add-ons';

/** What an option adds, as a line says it: "+৳50", "−৳20", nothing at no charge. */
function changeText(priceChange: string): string {
  const amount = priceChangeOf(priceChange);
  if (!Number.isFinite(amount) || amount === 0) return '';
  return amount < 0 ? `−${formatTaka(-amount)}` : `+${formatTaka(amount)}`;
}

/**
 * Add-ons (TENANT-DASHBOARD-DESIGN §7.33, the prototype's `k31-addons`; MNU-01): extras chosen when ordering, each group
 * with its rule and options; a group opens its sheet. They save with the product's own Save.
 */
export function AddOnsCard({
  groups,
  readOnly,
  onChange,
}: {
  groups: readonly AddOnGroup[];
  readOnly: boolean;
  onChange: (groups: AddOnGroup[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const ruleText = (group: AddOnGroup): string => {
    const rule = ruleOf(group);
    if (rule === 'any') return t('addOnRuleAny');
    if (rule === 'one') return t('addOnRuleOne');
    if (rule === 'required') return t('addOnRuleRequired');
    return t('addOnRuleCustomV', { min: group.minSelect, max: group.maxSelect });
  };
  return (
    <Card className="flex flex-col gap-3">
      <SectionHead
        link={
          readOnly || groups.length >= MODIFIER_GROUPS_MAX ? undefined : (
            <button
              type="button"
              className="inline-flex items-center gap-1"
              onClick={() => {
                setOpen('new');
              }}
            >
              <Icon name="plus" size={16} />
              {t('addOnAddGroup')}
            </button>
          )
        }
      >
        {t('addOnsTitle')}
      </SectionHead>
      <p className="text-[14px] text-fg-muted">{t('addOnsHelp')}</p>
      {groups.map((group, index) => (
        <button
          key={`${group.name}-${String(index)}`}
          type="button"
          disabled={readOnly}
          className="flex flex-col gap-1.5 rounded-card border border-line bg-neutral-50 p-3 text-left disabled:cursor-default"
          onClick={() => {
            setOpen(index);
          }}
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-[17px] font-semibold">{group.name}</span>
            <span className="text-[14px] text-fg-muted">{ruleText(group)}</span>
          </span>
          <span className="text-[14px] text-fg-muted">
            {group.options
              .map((option) => [option.name, changeText(option.priceChange)].filter(Boolean))
              .map((words) => words.join(' '))
              .join(' · ')}
          </span>
        </button>
      ))}
      {open !== null ? (
        <GroupSheet
          group={open === 'new' ? null : (groups[open] ?? null)}
          onSave={(group) => {
            onChange(
              open === 'new'
                ? [...groups, group]
                : groups.map((each, index) => (index === open ? group : each)),
            );
            setOpen(null);
          }}
          onDelete={
            open === 'new'
              ? null
              : () => {
                  onChange(groups.filter((_, index) => index !== open));
                  setOpen(null);
                }
          }
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
    </Card>
  );
}

const NEW_OPTION: AddOnOption = { name: '', priceChange: '', isDefault: false };

/**
 * A group's sheet (`sh-k31-group`, `sh-k31-group-custom`, `sh-k31-group-new`; agreed): its name; how many the customer
 * picks as plain rules, Custom showing the numbers; its options, each a name, what it adds to the price, Picked by
 * default and Remove. A rule of one keeps one default.
 */
function GroupSheet({
  group,
  onSave,
  onDelete,
  onClose,
}: {
  group: AddOnGroup | null;
  onSave: (group: AddOnGroup) => void;
  onDelete: (() => void) | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [name, setName] = useState(group?.name ?? '');
  const [rule, setRule] = useState<AddOnRule>(group ? ruleOf(group) : 'any');
  const [least, setLeast] = useState(String(group?.minSelect ?? 1));
  const [most, setMost] = useState(String(group?.maxSelect ?? 2));
  const [options, setOptions] = useState<AddOnOption[]>(group?.options ?? [NEW_OPTION]);
  const made: AddOnGroup = {
    name: name.trim(),
    ...rulesFor(rule, options.length, least, most),
    options: options.map((each) => ({ ...each, name: each.name.trim() })),
  };
  const problem = groupProblem(made);
  const change = (index: number, patch: Partial<AddOnOption>) => {
    setOptions((now) =>
      now.map((each, at) => {
        if (at === index) return { ...each, ...patch };
        // One may be picked, so one default: this one taking it lets the last one go.
        return patch.isDefault && made.maxSelect === 1 ? { ...each, isDefault: false } : each;
      }),
    );
  };
  const rules: [AddOnRule, string][] = [
    ['any', t('addOnRuleAny')],
    ['one', t('addOnRuleOne')],
    ['required', t('addOnRuleRequired')],
    ['custom', t('addOnRuleCustom')],
  ];
  return (
    <Sheet
      open
      title={group ? t('addOnGroupT') : t('addOnAddGroup')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={problem !== null}
          onClick={() => {
            onSave(made);
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <Field
        label={t('addOnGroupName')}
        value={name}
        maxLength={MODIFIER_NAME_MAX_LENGTH}
        placeholder={t('addOnGroupPh')}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <h3 className="mt-3 mb-1 text-[16.38px] font-bold">{t('addOnHowMany')}</h3>
      <div role="radiogroup" aria-label={t('addOnHowMany')} className="flex flex-col gap-4">
        {rules.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rule === value}
            className="flex min-h-11 items-center gap-3 text-left text-[15px] font-medium"
            onClick={() => {
              setRule(value);
            }}
          >
            <RadioMark on={rule === value} />
            {label}
          </button>
        ))}
      </div>
      {rule === 'custom' ? (
        <>
          <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
            <Field
              label={t('addOnLeast')}
              value={least}
              inputMode="numeric"
              onChange={(event) => {
                setLeast(event.target.value);
              }}
            />
            <Field
              label={t('addOnMost')}
              value={most}
              inputMode="numeric"
              onChange={(event) => {
                setMost(event.target.value);
              }}
            />
          </div>
          <p className={`mt-1 text-[14px] ${problem === 'rule' ? 'text-danger' : ''}`}>
            {problem === 'rule'
              ? t('addOnRuleBad', { count: options.length })
              : t('addOnRuleCustomV', { min: made.minSelect, max: made.maxSelect })}
          </p>
        </>
      ) : null}
      <h3 className="mt-3.5 text-[16.38px] font-bold">{t('addOnOptions')}</h3>
      <div className="flex flex-col [&>*]:border-t [&>*]:border-line">
        {options.map((option, index) => (
          <div key={index} className="flex flex-col gap-2 py-2.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('addOnOptionName')}
                value={option.name}
                maxLength={MODIFIER_NAME_MAX_LENGTH}
                onChange={(event) => {
                  change(index, { name: event.target.value });
                }}
              />
              <Field
                label={t('addOnPriceChange')}
                prefix="৳"
                inputMode="text"
                value={option.priceChange}
                error={
                  option.priceChange.trim() !== '' &&
                  !Number.isFinite(priceChangeOf(option.priceChange))
                    ? t('addOnPriceBad')
                    : undefined
                }
                onChange={(event) => {
                  change(index, { priceChange: event.target.value });
                }}
              />
            </div>
            <div className="flex min-h-9 items-center gap-3">
              <Switch
                checked={option.isDefault}
                label={`${t('addOnDefault')}: ${option.name}`}
                onChange={(isDefault) => {
                  change(index, { isDefault });
                }}
              />
              <span className="flex-1 text-[14px] font-medium">{t('addOnDefault')}</span>
              {options.length > 1 ? (
                <button
                  type="button"
                  aria-label={`${t('addOnRemove')}: ${option.name}`}
                  className="text-[13px] text-danger"
                  onClick={() => {
                    setOptions((now) => now.filter((_, at) => at !== index));
                  }}
                >
                  {t('addOnRemove')}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {options.length < MODIFIER_OPTIONS_MAX ? (
        <div className="mt-2">
          <Button
            tone="outline"
            size="sm"
            onClick={() => {
              setOptions((now) => [...now, NEW_OPTION]);
            }}
          >
            <Icon name="plus" />
            {t('addOnAddOption')}
          </Button>
        </div>
      ) : null}
      <p className="mt-2 text-[14px]">
        {t('addOnPriceHelp')} · {t('addOnKept')}
      </p>
      {onDelete ? (
        <div className="mt-3">
          <Button tone="ghost" size="sm" onClick={onDelete}>
            <span className="text-danger">{t('addOnDeleteGroup')}</span>
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
