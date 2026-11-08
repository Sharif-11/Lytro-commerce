import { Trans, useTranslation } from 'react-i18next';
import { NoticeSeverity, type NoticeAudience } from '@lytronix/validators';
import { useNoticeReach } from '@/api/notices';
import { ActionPanel } from '@/components/ui/action-panel';
import { Consequence } from '@/components/ui/consequence';
import { NOTE } from '@/components/ui/sizes';
import { formatSessionTime } from '@/lib/session-time';

const BOLD = { b: <b className="font-semibold" /> };

/**
 * NTC-06, NTC-11 (OPERATOR-CONSOLE-DESIGN §10c): what publishing or scheduling does, said before it is done -- the shops
 * the audience reaches now, how each is told, the prompt or the marquee, the countdown, and that no SMS is sent.
 */
export function PublishPanel({
  title,
  audience,
  severity,
  publishAt,
  windowEndsAt,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  audience: NoticeAudience;
  severity: NoticeSeverity;
  /** Null to publish now. */
  publishAt: string | null;
  windowEndsAt: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const reach = useNoticeReach({ audience, severity });
  const now = publishAt === null;
  const when = now ? t('notices.publishNowWord') : formatSessionTime(publishAt);
  const lines = [
    severity === NoticeSeverity.Important ? t('notices.publishImportant') : null,
    severity === NoticeSeverity.Urgent ? t('notices.publishUrgent') : null,
    windowEndsAt ? t('notices.publishWindow', { d: formatSessionTime(windowEndsAt) }) : null,
  ].filter(Boolean);
  return (
    <ActionPanel
      title={now ? t('notices.publishTitleNow') : t('notices.publishTitleAt')}
      sub={title}
      onClose={onClose}
      actionLabel={now ? t('notices.publishButtonNow') : t('notices.publishButtonAt', { d: when })}
      pending={pending}
      canSubmit={reach.data !== undefined}
      error={error}
      onSubmit={onConfirm}
    >
      <Consequence>
        <Trans
          i18nKey="notices.publishConsequence"
          values={{
            d: when,
            n: reach.data ? reach.data.shops.toLocaleString('en-US') : '…',
            e: severity === NoticeSeverity.Info ? '' : t('notices.publishEmail'),
          }}
          components={BOLD}
        />
        {lines.length ? ` ${lines.join(' ')}` : null}
      </Consequence>
      <Consequence tone="ok">{t('notices.publishNoSms')}</Consequence>
      <div className={NOTE}>{now ? t('notices.publishAfterNow') : t('notices.publishAfter')}</div>
    </ActionPanel>
  );
}
