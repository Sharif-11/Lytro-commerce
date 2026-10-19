import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Card, EmptyLine } from '@/components/ui/fields';
import { limitLabelKey } from '@/lib/limit-keys';
import type { Plan } from '@/types/operator';

interface PlanListProps {
  plans: Plan[];
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}

/** One card per plan, in rank order, with its limits summarised. */
export function PlanList({ plans, onEdit, onDelete }: PlanListProps): React.JSX.Element {
  const { t } = useTranslation();
  if (plans.length === 0) return <EmptyLine>{t('plans.empty')}</EmptyLine>;

  const sorted = [...plans].sort((a, b) => a.rank - b.rank);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((plan) => (
        <Card key={plan.id}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="heading text-[17px] text-fg">{plan.name}</h3>
              <p className="text-[13px] text-fg-muted">
                {t('plans.rankLabel', { rank: plan.rank })} · v{plan.version}
              </p>
            </div>
            <Tag tone={plan.forSale ? 'brand' : 'neutral'}>
              {plan.forSale ? t('plans.forSale') : t('plans.notForSale')}
            </Tag>
          </div>
          {plan.description ? (
            <p className="mt-2 text-[13px] text-fg-muted">{plan.description}</p>
          ) : null}
          <ul className="num mt-3 space-y-0.5 text-[13px] text-fg-muted">
            {Object.entries(plan.limits).map(([key, value]) => (
              <li key={key} className="flex justify-between gap-3">
                <span>{t(limitLabelKey(key), { defaultValue: key })}</span>
                <span className="text-fg">
                  {value === null ? t('plans.unlimited') : String(value)}
                </span>
              </li>
            ))}
          </ul>
          {Object.keys(plan.features).length > 0 ? (
            <p className="mono mt-2 text-[12px] text-fg-muted">
              {Object.entries(plan.features)
                .map(([key, on]) => `${key}${on ? '' : ':off'}`)
                .join(' · ')}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button
              type="button"
              tone="outline"
              small
              fit
              onClick={() => {
                onEdit(plan);
              }}
            >
              {t('common.edit')}
            </Button>
            <Button
              type="button"
              tone="danger"
              small
              fit
              onClick={() => {
                onDelete(plan);
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
