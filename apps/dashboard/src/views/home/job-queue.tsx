import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHead } from '@/components/ui/page';
import { RowList } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useShell } from '@/shell/shell-context';
import type { HomeView } from '@/types/home';
import { jobsOf, type Job, type JobTone } from './jobs';

const TONES: Record<JobTone, string> = {
  red: 'bg-danger-soft text-danger',
  marigold: 'bg-warning-soft text-warning',
  teal: 'bg-info-soft text-info',
};

/** One job (the prototype's `.job`): what needs the person, opening the list it is about. */
const JOB_ROW =
  'flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left no-underline hover:bg-neutral-50';

function JobRow({ job, slug }: { job: Job; slug: string }): React.JSX.Element {
  const inside = (
    <>
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-card ${TONES[job.tone]}`}
      >
        <Icon name={job.icon} />
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-medium">{job.text}</span>
      {job.count !== null ? (
        <span className="num inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-fg px-2 text-[14px] font-semibold text-white">
          {job.count}
        </span>
      ) : null}
      <Icon name="right" />
    </>
  );
  return job.paymentId ? (
    <Link
      to="/$shop/billing/$paymentId"
      params={{ shop: slug, paymentId: job.paymentId }}
      className={JOB_ROW}
    >
      {inside}
    </Link>
  ) : (
    <Link to={job.to} params={{ shop: slug }} className={JOB_ROW}>
      {inside}
    </Link>
  );
}

/** "To do today" (TENANT-DASHBOARD-DESIGN §7.1): the queue, or one line saying there is nothing (§9's empty state). */
export function JobQueue({ home }: { home: HomeView | undefined }): React.JSX.Element {
  const { t } = useTranslation('home');
  const { slug, viewer, tenant } = useShell();
  const jobs = home ? jobsOf(home, { t, viewer, tenant }) : [];
  return (
    <section aria-label={t('todayJobs')}>
      <SectionHead>{t('todayJobs')}</SectionHead>
      <Card flush className="mt-2">
        {!home ? (
          <SkeletonRows count={3} />
        ) : jobs.length === 0 ? (
          <EmptyState icon="check">{t('allClear')}</EmptyState>
        ) : (
          <RowList>
            {jobs.map((job) => (
              <JobRow key={job.key} job={job} slug={slug} />
            ))}
          </RowList>
        )}
      </Card>
    </section>
  );
}
