import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActivityList, type ActivityFilters as Filters } from '@/api/activity';
import { useStaffList } from '@/api/staff';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/button';
import { ActivityFilters } from '@/views/activity/activity-filters';
import { ActivityList } from '@/views/activity/activity-list';

/** Container (ENGINEERING-STANDARDS.md §2a): owns filter state and the infinite-query's pages. ActivityFilters
    and ActivityList stay presentational. */
export function Activity(): React.JSX.Element {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<Filters>({});
  const activity = useActivityList(filters);
  const staffList = useStaffList();

  const entries = activity.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('activity.title')}</h1>
      </div>

      <ActivityFilters value={filters} staff={staffList.data?.staff ?? []} onChange={setFilters} />

      {activity.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {activity.isError ? <ErrorBanner message={errorMessage(activity.error, t)} /> : null}
      {!activity.isLoading && !activity.isError ? <ActivityList entries={entries} /> : null}

      {activity.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          loading={activity.isFetchingNextPage}
          className="w-auto! mx-auto"
          onClick={() => {
            void activity.fetchNextPage();
          }}
        >
          {t('activity.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
