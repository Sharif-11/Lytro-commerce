import { useTranslation } from 'react-i18next';
import type { StaffMember } from '@/types/staff';
import { ACTION_OPTIONS } from '@/views/activity/action-options';
import type { ActivityFilters as Filters } from '@/api/activity';

interface ActivityFiltersProps {
  value: Filters;
  staff: StaffMember[];
  onChange: (value: Filters) => void;
}

const FIELD_CLASS =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none';

/** Presentational filter bar — date range, actor and action, each optional. The container debounces nothing
    here; every change re-fetches immediately since these are infrequent, deliberate picks, not free-text
    typing. */
export function ActivityFilters({
  value,
  staff,
  onChange,
}: ActivityFiltersProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t('activity.filters.dateFrom')}
        <input
          type="date"
          className={FIELD_CLASS}
          value={value.dateFrom ?? ''}
          onChange={(event) => {
            onChange({ ...value, dateFrom: event.target.value || undefined });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t('activity.filters.dateTo')}
        <input
          type="date"
          className={FIELD_CLASS}
          value={value.dateTo ?? ''}
          onChange={(event) => {
            onChange({ ...value, dateTo: event.target.value || undefined });
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t('activity.filters.actor')}
        <select
          className={FIELD_CLASS}
          value={value.actorId ?? ''}
          onChange={(event) => {
            onChange({ ...value, actorId: event.target.value || undefined });
          }}
        >
          <option value="">{t('activity.filters.allActors')}</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.phone}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t('activity.filters.action')}
        <select
          className={FIELD_CLASS}
          value={value.action ?? ''}
          onChange={(event) => {
            onChange({ ...value, action: event.target.value || undefined });
          }}
        >
          <option value="">{t('activity.filters.allActions')}</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.labelKey)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
