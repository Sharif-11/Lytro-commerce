import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { NoticeSeverity, noticePlainText } from '@lytronix/validators';
import { useNotice, useNoticeSummary } from '@/api/notices';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { useShell } from '@/shell/shell-context';
import type { NoticeBrief } from '@/types/notices';
import { SeverityTag } from '@/views/notices/board';

/** Renew's own card (Part 37's `p37RenewCard`): 4 px under what is above it, its words to the left. */
const CARD = 'mt-1 text-left';

/**
 * A locked shop's way to the board (Part 37's `p37-locked`, NTC-07): the owner still reads Lytro's notices, with how many
 * are unread.
 */
export function LockedNotices(): React.JSX.Element | null {
  const { t } = useTranslation('menu');
  const { slug, viewer } = useShell();
  const summary = useNoticeSummary({ enabled: viewer.isOwner });
  if (!viewer.isOwner || !summary.data) return null;
  return (
    <Card className={CARD}>
      <Link
        to="/$shop/notices"
        params={{ shop: slug }}
        className="flex min-h-[52px] w-full items-center gap-3 text-left text-fg no-underline"
      >
        <span className="flex size-10 flex-none items-center justify-center rounded-button bg-accent-100 text-accent-700">
          <Icon name="megaphone" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[16px] font-medium">{t('p37LockedNotices')}</span>
          <span className="text-[14px] text-fg-muted">
            {t('p37LockedNoticesD', { count: summary.data.unread })}
          </span>
        </span>
        <span className="text-neutral-500">
          <Icon name="right" />
        </span>
      </Link>
    </Card>
  );
}

/** One urgent notice on an archived shop's page, its words read in full. */
function UrgentCard({ brief }: { brief: NoticeBrief }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const notice = useNotice(brief.id);
  return (
    <Card className={CARD}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-neutral-700">
          <span>{t('p37BellLytro')}</span> · <SeverityTag notice={brief} />
        </div>
        <h3 dir="auto" className="text-[16px] font-semibold">
          {brief.title}
        </h3>
      </div>
      {notice.data ? (
        <p dir="auto" className="mt-1.5 text-[14px] text-fg-muted">
          {noticePlainText(notice.data.body)}
        </p>
      ) : null}
    </Card>
  );
}

/** An archived shop shows only urgent notices, here on its page (Part 37's `p37-archived`, NTC-07). */
export function ArchivedNotices(): React.JSX.Element | null {
  const { viewer } = useShell();
  const summary = useNoticeSummary({ enabled: viewer.isOwner });
  const urgent = (summary.data?.banners ?? []).filter(
    (each) => each.severity === NoticeSeverity.Urgent,
  );
  if (!viewer.isOwner || urgent.length === 0) return null;
  return (
    <>
      {urgent.map((brief) => (
        <UrgentCard key={brief.id} brief={brief} />
      ))}
    </>
  );
}
