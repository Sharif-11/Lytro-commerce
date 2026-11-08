import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useNoticeSummary } from '@/api/notices';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHead } from '@/components/ui/page';
import { RowList } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { HomeView } from '@/types/home';
import type { NoticeBrief } from '@/types/notices';
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
  ) : job.to === '/$shop/orders' ? (
    <Link
      to={job.to}
      params={{ shop: slug }}
      search={job.ordersTab ? { tab: job.ordersTab } : {}}
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

/**
 * NTC-05 (Part 37's `p37-home-ack`): the notices waiting for the owner's "I understand", first in the queue; one opens
 * itself, more open the board.
 */
function AckJob({ notices, slug }: { notices: NoticeBrief[]; slug: string }): React.JSX.Element {
  const { t } = useTranslation('home');
  const [only] = notices;
  const inside = (
    <>
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-card ${TONES.marigold}`}
      >
        <Icon name="megaphone" />
      </span>
      <span className="min-w-0 flex-1 text-[16px] font-medium">
        {t('p37JobAck', { count: notices.length })}
      </span>
      <span className="num inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-fg px-2 text-[14px] font-semibold text-white">
        {notices.length}
      </span>
      <Icon name="right" />
    </>
  );
  return notices.length === 1 && only ? (
    <Link
      to="/$shop/notices/$noticeId"
      params={{ shop: slug, noticeId: only.id }}
      className={JOB_ROW}
    >
      {inside}
    </Link>
  ) : (
    <Link to="/$shop/notices" params={{ shop: slug }} className={JOB_ROW}>
      {inside}
    </Link>
  );
}

/** "To do today" (TENANT-DASHBOARD-DESIGN §7.1): the queue, or one line saying there is nothing (§9's empty state). */
export function JobQueue({ home }: { home: HomeView | undefined }): React.JSX.Element {
  const { t } = useTranslation('home');
  const { slug, viewer, tenant } = useShell();
  const summary = useNoticeSummary({ enabled: allows(viewer, [Permission.NoticesRead]) });
  const toAcknowledge = viewer.isOwner ? (summary.data?.toAcknowledge ?? []) : [];
  const jobs = home ? jobsOf(home, { t, viewer, tenant }) : [];
  return (
    <section aria-label={t('todayJobs')}>
      <SectionHead>{t('todayJobs')}</SectionHead>
      <Card flush className="mt-2">
        {!home ? (
          <SkeletonRows count={3} />
        ) : jobs.length === 0 && toAcknowledge.length === 0 ? (
          <EmptyState icon="check">{t('allClear')}</EmptyState>
        ) : (
          <RowList>
            {toAcknowledge.length > 0 ? <AckJob notices={toAcknowledge} slug={slug} /> : null}
            {jobs.map((job) => (
              <JobRow key={job.key} job={job} slug={slug} />
            ))}
          </RowList>
        )}
      </Card>
    </section>
  );
}
