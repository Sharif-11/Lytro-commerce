import { useTranslation } from 'react-i18next';
import { Card, formatDate, Tag } from '@lytronix/ui';
import type { TenantSummary } from '@/types/operator';

interface TenantListProps {
  tenants: TenantSummary[];
  selectedId: string | null;
  onSelect: (tenant: TenantSummary) => void;
}

const STATE_TONES: Record<string, 'brand' | 'accent' | 'danger' | 'neutral' | 'success'> = {
  active: 'success',
  trial: 'brand',
  pay_as_you_go: 'brand',
  grace: 'accent',
  read_only: 'accent',
  locked: 'danger',
  archived: 'neutral',
  deleted: 'neutral',
};

/** One row per shop; tapping a row opens its panel above the list. */
export function TenantList({ tenants, selectedId, onSelect }: TenantListProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <Card className="divide-y divide-line !p-0">
      {tenants.map((tenant) => (
        <button
          key={tenant.id}
          type="button"
          aria-pressed={tenant.id === selectedId}
          onClick={() => {
            onSelect(tenant);
          }}
          className={`flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-hover ${
            tenant.id === selectedId ? 'bg-surface-alt' : ''
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-fg">
              {tenant.shopName}
              <Tag tone={STATE_TONES[tenant.state] ?? 'neutral'}>{t(`states.${tenant.state}`)}</Tag>
              {tenant.suspendedAt ? <Tag tone="danger">{t('tenants.suspended')}</Tag> : null}
            </p>
            <p className="num text-[13px] text-fg-muted">
              {tenant.slug}
              {tenant.planName ? ` · ${tenant.planName}` : ''}
              {tenant.periodEnd
                ? ` · ${t('tenants.periodEnd', { date: formatDate(tenant.periodEnd, i18n.language) })}`
                : ''}
            </p>
          </div>
        </button>
      ))}
    </Card>
  );
}
