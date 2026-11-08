import { useTranslation } from 'react-i18next';
import { NoticeSeverity, renderNoticeMarkdown, type NoticeCategory } from '@lytronix/validators';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { StatusChip } from '@/components/ui/status-chip';
import { formatDay } from '@/lib/format';
import { PinMark, SeverityChip } from './notice-words';

/** D7-53's few marks as the server renders them: escaped first, then paragraphs, bold, https links and lists. */
export const MARKDOWN =
  'text-[14px] leading-[1.55] [overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline [&_li]:my-0.5 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:ml-5 [&_ul]:list-disc [&_ul:last-child]:mb-0';

/** A body as the board shows it, from the one renderer the server uses (NTC-16). */
export function NoticeBody({ body }: { body: string }): React.JSX.Element {
  // renderNoticeMarkdown escapes every character before adding its own few tags, so nothing typed can run.
  return (
    <div className={MARKDOWN} dangerouslySetInnerHTML={{ __html: renderNoticeMarkdown(body) }} />
  );
}

export const CAPTION = 'text-[12px] font-semibold text-fg-muted';

/**
 * A notice as a shop's board shows it, in one language: its severity, category and "updated", the words, and "From
 * Lytro" with the day. Above it, what an important or an urgent one also does there (D7-54).
 */
export function BoardCard({
  title,
  body,
  severity,
  category,
  pinned,
  editedAt,
  publishAt,
  extra = true,
}: {
  title: string;
  body: string;
  severity: NoticeSeverity;
  category: NoticeCategory;
  pinned: boolean;
  editedAt: string | null;
  publishAt: string | null;
  extra?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      {extra && severity === NoticeSeverity.Urgent ? (
        <>
          <div className={CAPTION}>{t('notices.alsoMarquee')}</div>
          <div className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-[#f3c3c6] bg-danger-soft px-3 py-2 text-[13px] font-semibold whitespace-nowrap text-[#7a1f25]">
            <ConsoleIcon name="warn" size={18} />
            <span className="truncate">
              {t('notices.fromLytro')}: {title}
            </span>
          </div>
        </>
      ) : null}
      {extra && severity === NoticeSeverity.Important ? (
        <div className={CAPTION}>{t('notices.alsoPrompt')}</div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2 rounded-[10px] border border-line bg-surface px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <PinMark pinned={pinned} />
          <SeverityChip severity={severity} />
          <StatusChip tone="mute" plain>
            {t(`notices.categories.${category}`)}
          </StatusChip>
          {editedAt ? (
            <StatusChip tone="mute" plain>
              {t('notices.updated', { d: formatDay(editedAt) })}
            </StatusChip>
          ) : null}
        </div>
        <div className="text-[16px] leading-[1.35] font-semibold [overflow-wrap:anywhere]">
          {title}
        </div>
        {body ? <NoticeBody body={body} /> : null}
        <div className="text-[12px] text-fg-muted">
          {t('notices.fromLytro')} · {formatDay(publishAt ?? new Date().toISOString())}
        </div>
      </div>
    </>
  );
}
