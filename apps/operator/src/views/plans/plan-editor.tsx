import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, CheckboxRow, TextArea, TextField } from '@lytronix/ui';
import type { PlanLimits } from '@lytronix/validators';
import { useCreatePlan, usePlanVersions, useUpdatePlan } from '@/api/plans';
import { ActionPanel } from '@/components/ui/action-panel';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { INLINE_FIELD, NOTE, QUIET_BUTTON, SMALL_BUTTON, TWO_FIELDS } from '@/components/ui/sizes';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { TagButton, TagLine } from '@/components/ui/value-tag';
import { problemsOf } from '@/lib/form-problems';
import { formatDay } from '@/lib/format';
import { canBeUnlimited, LIMIT_KEYS, limitLabelKey, type LimitKey } from '@/lib/limit-keys';
import type { OperatorPlan } from '@/types/operator';
import { shopsOn, versionLines } from './plan-history';

interface LimitDraft {
  value: string;
  unlimited: boolean;
}

function draftsFrom(limits: PlanLimits | undefined): Record<LimitKey, LimitDraft> {
  const drafts = {} as Record<LimitKey, LimitDraft>;
  for (const key of LIMIT_KEYS) {
    const value = limits?.[key];
    drafts[key] = {
      value: value === undefined || value === null ? '' : String(value),
      unlimited: value === null,
    };
  }
  return drafts;
}

/** PLN-19: a ticked limit is unlimited (null); an empty one is left unset, for the reader's own default. */
function limitsFrom(drafts: Record<LimitKey, LimitDraft>): PlanLimits {
  const limits: Record<string, number | null> = {};
  for (const key of LIMIT_KEYS) {
    const draft = drafts[key];
    if (canBeUnlimited(key) && draft.unlimited) limits[key] = null;
    else if (draft.value.trim() !== '') limits[key] = Number(draft.value);
  }
  return limits;
}

/** OPERATOR-CONSOLE-DESIGN §6: one panel to make a plan or save its next version. */
export function PlanEditor({
  plan,
  allPlans,
  onClose,
  onVersions,
  onDelete,
}: {
  plan: OperatorPlan | null;
  allPlans: readonly OperatorPlan[];
  onClose: () => void;
  onVersions: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const versions = usePlanVersions(plan?.id ?? null);
  const highestRank = Math.max(-1, ...allPlans.map((each) => each.rank));
  const [name, setName] = useState(plan?.name ?? '');
  const [rank, setRank] = useState(String(plan?.rank ?? highestRank + 1));
  const [description, setDescription] = useState(plan?.description ?? '');
  const [forSale, setForSale] = useState(plan?.forSale ?? true);
  const [drafts, setDrafts] = useState(() => draftsFrom(plan?.limits));
  const [features, setFeatures] = useState<Record<string, boolean>>(() => {
    if (plan) return plan.features;
    // A new plan starts with the flags the others have, all off.
    const flags = allPlans.flatMap((each) => Object.keys(each.features));
    return Object.fromEntries(flags.map((key) => [key, false]));
  });
  const [addingFlag, setAddingFlag] = useState<string | null>(null);
  const saving = plan ? update : create;
  const problems = problemsOf(saving.error, t, ['name', 'rank', 'description']);

  function setLimit(key: LimitKey, patch: Partial<LimitDraft>): void {
    setDrafts((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function addFlag(): void {
    const key = (addingFlag ?? '').trim();
    if (key !== '') setFeatures((current) => ({ ...current, [key]: true }));
    setAddingFlag(null);
  }

  function handleFlagKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      addFlag();
    }
  }

  function submit(): void {
    const values = {
      name: name.trim(),
      rank: Number(rank),
      forSale,
      limits: limitsFrom(drafts),
      features,
    };
    if (plan) {
      update.mutate(
        { id: plan.id, ...values, description: description.trim() },
        {
          onSuccess: () => {
            toast(t('plans.saved', { name: values.name, n: plan.version + 1 }));
            onClose();
          },
        },
      );
      return;
    }
    create.mutate(
      {
        ...values,
        description: description.trim() === '' ? undefined : description.trim(),
      },
      {
        onSuccess: () => {
          toast(t('plans.created', { name: values.name }));
          onClose();
        },
      },
    );
  }

  const current = plan
    ? versionLines(plan, versions.data ?? []).find((line) => line.current)
    : undefined;
  const shops = plan ? shopsOn(plan) : 0;

  return (
    <ActionPanel
      title={plan ? t('plans.editTitle', { name: plan.name }) : t('plans.newTitle')}
      sub={plan ? `v${String(plan.version)} · ${t('plans.rank')} ${String(plan.rank)}` : undefined}
      onClose={onClose}
      actionLabel={plan ? t('plans.saveAs', { n: plan.version + 1 }) : t('plans.create')}
      pending={saving.isPending}
      canSubmit={name.trim() !== ''}
      error={problems.banner}
      onSubmit={submit}
    >
      <div className={TWO_FIELDS}>
        <TextField
          label={t('plans.name')}
          name="name"
          required
          maxLength={100}
          data-autofocus
          error={problems.field('name')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <TextField
          label={t('plans.rank')}
          name="rank"
          required
          mono
          inputMode="numeric"
          error={problems.field('rank')}
          value={rank}
          onChange={(event) => {
            setRank(event.target.value);
          }}
        />
      </div>
      <TextArea
        label={t('plans.description')}
        name="description"
        maxLength={2000}
        error={problems.field('description')}
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
      />
      <Switch checked={forSale} onChange={setForSale} label={t('plans.forSale')} showLabel />
      <div className="h-px bg-line" />
      <h3 className="text-[15px] font-semibold">{t('plans.limits')}</h3>
      <div className="flex flex-col rounded-lg border border-line">
        {LIMIT_KEYS.map((key) => {
          const label = t(limitLabelKey(key));
          const draft = drafts[key];
          return (
            <div
              key={key}
              className="flex min-h-12 items-center gap-3 border-t border-line px-3 py-1 first:border-t-0"
            >
              <span className="min-w-0 flex-1 text-[14px] font-medium">{label}</span>
              <input
                aria-label={label}
                name={`limit-${key}`}
                inputMode="numeric"
                placeholder={draft.unlimited ? '' : t('plans.notSet')}
                disabled={draft.unlimited}
                value={draft.unlimited ? '' : draft.value}
                onChange={(event) => {
                  setLimit(key, { value: event.target.value });
                }}
                className={`${INLINE_FIELD} mono w-[120px] text-right`}
              />
              {canBeUnlimited(key) ? (
                <CheckboxRow
                  label={
                    <>
                      {t('plans.unlimited')}
                      <span className="sr-only"> {label}</span>
                    </>
                  }
                  checked={draft.unlimited}
                  onChange={(unlimited) => {
                    setLimit(key, { unlimited });
                  }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <h3 className="text-[15px] font-semibold">{t('plans.features')}</h3>
      <TagLine>
        {Object.entries(features).map(([key, on]) => (
          <TagButton
            key={key}
            tone={on ? 'on' : 'strike'}
            aria-pressed={on}
            onClick={() => {
              setFeatures((current) => ({ ...current, [key]: !on }));
            }}
          >
            {key}
          </TagButton>
        ))}
        {addingFlag === null ? (
          <TagButton
            aria-label={t('plans.addFlag')}
            onClick={() => {
              setAddingFlag('');
            }}
          >
            <ConsoleIcon name="plus" size={14} />
          </TagButton>
        ) : (
          <input
            aria-label={t('plans.addFlag')}
            name="new-flag"
            autoFocus
            placeholder={t('plans.flagKey')}
            value={addingFlag}
            onChange={(event) => {
              setAddingFlag(event.target.value);
            }}
            onKeyDown={handleFlagKey}
            onBlur={addFlag}
            className={`${INLINE_FIELD} mono w-40`}
          />
        )}
      </TagLine>
      {plan ? (
        <>
          {current ? (
            <div className={NOTE}>
              {t('plans.versionNote', {
                v: plan.version,
                d: formatDay(current.at),
                n: plan.version + 1,
              })}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onVersions}
              className="inline-flex items-center gap-1 text-[14px] font-medium text-primary"
            >
              <ConsoleIcon name="history" size={16} />
              {t('plans.versions')}
            </button>
            <span className="flex-1" />
            <Button
              type="button"
              tone="ghost"
              small
              fit
              disabled={!plan.deletable}
              className={`${SMALL_BUTTON} ${QUIET_BUTTON}`}
              onClick={onDelete}
            >
              <ConsoleIcon name="trash" size={16} />
              {t('plans.delete')}
            </Button>
            {plan.deletable ? null : (
              <span className={NOTE}>
                {shops > 0
                  ? t('plans.deleteBlocked', { count: shops })
                  : t('plans.deleteBlockedOther')}
              </span>
            )}
          </div>
        </>
      ) : null}
    </ActionPanel>
  );
}
