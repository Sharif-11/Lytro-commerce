import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanLimits } from '@lytronix/validators';
import { Button, Card, CardTitle, CheckboxRow, ErrorBanner, TextField } from '@lytronix/ui';
import { canBeUnlimited, LIMIT_KEYS, limitLabelKey, type LimitKey } from '@/lib/limit-keys';
import type { Plan } from '@/types/operator';

export interface PlanFormValues {
  name: string;
  description?: string;
  rank: number;
  forSale: boolean;
  limits: PlanLimits;
  features: Record<string, boolean>;
}

interface PlanFormProps {
  mode: 'create' | 'edit';
  initial?: Plan;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: PlanFormValues) => void;
}

interface LimitDraft {
  value: string;
  unlimited: boolean;
}

function draftFrom(limits: PlanLimits | undefined): Record<LimitKey, LimitDraft> {
  const draft = {} as Record<LimitKey, LimitDraft>;
  for (const key of LIMIT_KEYS) {
    const value = limits?.[key];
    draft[key] = {
      value: value === undefined || value === null ? '' : String(value),
      unlimited: value === null,
    };
  }
  return draft;
}

/** One form for create and edit. Limits follow the validator's own key list; a blank limit is left unset
    (the consumer's default), a ticked "unlimited" sends null (PLN-19). Features are free key/flag rows. */
export function PlanForm({
  mode,
  initial,
  pending,
  error,
  onCancel,
  onSubmit,
}: PlanFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [rank, setRank] = useState(String(initial?.rank ?? 0));
  const [forSale, setForSale] = useState(initial?.forSale ?? true);
  const [limits, setLimits] = useState(draftFrom(initial?.limits));
  const [features, setFeatures] = useState(
    initial ? Object.entries(initial.features).map(([key, value]) => ({ key, value })) : [],
  );

  function setLimit(key: LimitKey, patch: Partial<LimitDraft>): void {
    setLimits((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const outLimits: Record<string, number | null> = {};
    for (const key of LIMIT_KEYS) {
      const draft = limits[key];
      if (canBeUnlimited(key) && draft.unlimited) outLimits[key] = null;
      else if (draft.value.trim() !== '') outLimits[key] = Number(draft.value);
    }
    const outFeatures: Record<string, boolean> = {};
    for (const row of features) {
      if (row.key.trim() !== '') outFeatures[row.key.trim()] = row.value;
    }
    onSubmit({
      name: name.trim(),
      description: description.trim() === '' ? undefined : description.trim(),
      rank: Number(rank),
      forSale,
      limits: outLimits,
      features: outFeatures,
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-5">
        <CardTitle>
          {mode === 'create' ? t('plans.addTitle') : t('plans.editTitle', { name: initial?.name })}
        </CardTitle>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('plans.name')}
            name="name"
            required
            maxLength={100}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <TextField
            label={t('plans.rank')}
            name="rank"
            type="number"
            required
            hint={t('plans.rankHint')}
            value={rank}
            onChange={(event) => {
              setRank(event.target.value);
            }}
          />
        </div>
        <TextField
          label={t('plans.description')}
          name="description"
          maxLength={2000}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
        <CheckboxRow label={t('plans.forSale')} checked={forSale} onChange={setForSale} />

        <div>
          <p className="mb-2 text-[13px] font-bold text-fg">{t('plans.limits')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {LIMIT_KEYS.map((key) => (
              <div key={key}>
                <TextField
                  label={t(limitLabelKey(key))}
                  name={`limit-${key}`}
                  type="number"
                  min={0}
                  disabled={limits[key].unlimited}
                  placeholder={limits[key].unlimited ? t('plans.unlimited') : t('plans.notSet')}
                  value={limits[key].unlimited ? '' : limits[key].value}
                  onChange={(event) => {
                    setLimit(key, { value: event.target.value });
                  }}
                />
                {canBeUnlimited(key) ? (
                  <CheckboxRow
                    label={<span className="text-[13px]">{t('plans.unlimited')}</span>}
                    checked={limits[key].unlimited}
                    onChange={(checked) => {
                      setLimit(key, { unlimited: checked });
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-bold text-fg">{t('plans.features')}</p>
            <Button
              type="button"
              tone="ghost"
              small
              fit
              onClick={() => {
                setFeatures((rows) => [...rows, { key: '', value: true }]);
              }}
            >
              {t('plans.addFeature')}
            </Button>
          </div>
          {features.length === 0 ? (
            <p className="text-[13px] text-fg-muted">{t('plans.noFeatures')}</p>
          ) : null}
          <div className="space-y-2">
            {features.map((row, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[160px] flex-1">
                  <TextField
                    label={t('plans.featureKey')}
                    name={`feature-${String(index)}`}
                    mono
                    value={row.key}
                    onChange={(event) => {
                      setFeatures((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, key: event.target.value } : r)),
                      );
                    }}
                  />
                </div>
                <CheckboxRow
                  label={t('common.on')}
                  checked={row.value}
                  onChange={(checked) => {
                    setFeatures((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, value: checked } : r)),
                    );
                  }}
                />
                <Button
                  type="button"
                  tone="danger"
                  small
                  fit
                  onClick={() => {
                    setFeatures((rows) => rows.filter((_, i) => i !== index));
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error ? <ErrorBanner message={error} /> : null}
        <div className="flex gap-2">
          <Button type="submit" fit loading={pending}>
            {mode === 'create' ? t('plans.create') : t('common.save')}
          </Button>
          <Button type="button" tone="outline" fit onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
