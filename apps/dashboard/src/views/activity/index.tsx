import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActorType, AuditResult } from '@lytronix/validators';
import { useActivityList, type ActivityFilters } from '@/api/activity';
import { errorMessage } from '@/api/error-message';
import { useStaffList } from '@/api/staff';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { EmptyLine, Page, PageHeader, SelectField } from '@/components/ui/fields';
import { formatDateTime } from '@/lib/dates';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import type { ActivityEntry } from '@/types/activity';
import { ACTION_OPTIONS, actionLabelKey } from './action-options';

const SYSTEM: string = ActorType.System;
const PLATFORM_SUPPORT: string = ActorType.PlatformSupport;
const FAILURE: string = AuditResult.Failure;

/** AUD-04: the shop's activity log, newest first, with date, actor and action filters. */
export function Activity(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [filters, setFilters] = useState<ActivityFilters>({});
  const activity = useActivityList(filters);
  const staff = useStaffList();
  const entries = activity.data?.pages.flatMap((page) => page.entries) ?? [];

  const actorLabel = (entry: ActivityEntry): string => {
    if (entry.actorName !== null) return entry.actorName;
    if (entry.actorType === PLATFORM_SUPPORT) return t('activity.actorFallback.platformSupport');
    if (entry.actorType === SYSTEM) return t('activity.actorFallback.system');
    return t('activity.actorFallback.unknown');
  };

  return (
    <Page>
      <PageHeader title={t('activity.title')} />
      <div className="grid gap-3 rounded-card border border-line bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        <TextField
          label={t('activity.filters.dateFrom')}
          name="dateFrom"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(event) => {
            setFilters({ ...filters, dateFrom: event.target.value || undefined });
          }}
        />
        <TextField
          label={t('activity.filters.dateTo')}
          name="dateTo"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(event) => {
            setFilters({ ...filters, dateTo: event.target.value || undefined });
          }}
        />
        <SelectField
          label={t('activity.filters.actor')}
          name="actorId"
          value={filters.actorId ?? ''}
          onChange={(event) => {
            setFilters({ ...filters, actorId: event.target.value || undefined });
          }}
        >
          <option value="">{t('activity.filters.allActors')}</option>
          {(staff.data?.staff ?? []).map((member) => (
            <option key={member.id} value={member.id}>
              {member.name ?? member.phone ?? member.id}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('activity.filters.action')}
          name="action"
          value={filters.action ?? ''}
          onChange={(event) => {
            setFilters({ ...filters, action: event.target.value || undefined });
          }}
        >
          <option value="">{t('activity.filters.allActions')}</option>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.labelKey ? t(option.labelKey) : option.value}
            </option>
          ))}
        </SelectField>
      </div>

      {activity.isLoading ? (
        <p className="text-center text-[15px] text-neutral-700">{t('common.loading')}</p>
      ) : null}
      {activity.isError ? <ErrorBanner message={errorMessage(activity.error, t)} /> : null}
      {!activity.isLoading && !activity.isError && entries.length === 0 ? (
        <EmptyLine>{t('activity.noneYet')}</EmptyLine>
      ) : null}
      {entries.length > 0 ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-white shadow-card">
          {entries.map((entry) => {
            const key = actionLabelKey(entry.action);
            return (
              <li key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {key ? t(key) : entry.action}
                  </p>
                  <p className="text-[13px] text-neutral-700">
                    {actorLabel(entry)} · {formatDateTime(entry.createdAt, i18n.language)}
                  </p>
                </div>
                <Tag tone={entry.result === FAILURE ? 'danger' : 'success'}>
                  {entry.result === FAILURE
                    ? t('activity.result.failure')
                    : t('activity.result.success')}
                </Tag>
              </li>
            );
          })}
        </ul>
      ) : null}
      {activity.hasNextPage ? (
        <Button
          type="button"
          tone="outline"
          fit
          loading={activity.isFetchingNextPage}
          onClick={() => {
            void activity.fetchNextPage();
          }}
        >
          {t('common.loadMore')}
        </Button>
      ) : null}
    </Page>
  );
}
