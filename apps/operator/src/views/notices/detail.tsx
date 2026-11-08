import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { NoticeSeverity, NoticeStatus } from '@lytronix/validators';
import { useNoticeAcknowledgments, useWithdrawNotice } from '@/api/notices';
import { useRateChange } from '@/api/rates';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { figureBox } from '@/components/ui/figure-box';
import { Figure, FigureBody, Figures } from '@/components/ui/figures';
import { KeyValue, KeyValues } from '@/components/ui/key-values';
import { Panel } from '@/components/ui/panel';
import { NOTE, QUIET_BUTTON } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { NoticeVersion, OperatorNoticeDetail } from '@/types/notices';
import { rateWords } from '@/views/rates/rate-words';
import { BoardCard, CAPTION, NoticeBody } from './board-card';
import { titleIn } from './notice-text';
import { AudienceWords, NoticeStatusChip, PinMark, SeverityChip } from './notice-words';

const ACTION = 'flex-[1_1_auto] sm:flex-none';

/** NTC-08: an earlier version, both languages as the board showed it. */
function VersionPanel({
  notice,
  version,
  onClose,
}: {
  notice: OperatorNoticeDetail;
  version: NoticeVersion;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const card = (language: 'bn' | 'en') => {
    const words = { ...notice, ...version.snapshot };
    return (
      <BoardCard
        title={titleIn(words, language)}
        body={
          (language === 'bn' ? words.bodyBn || words.bodyEn : words.bodyEn || words.bodyBn) ?? ''
        }
        severity={version.snapshot.severity}
        category={version.snapshot.category}
        pinned={notice.pinned}
        editedAt={null}
        publishAt={notice.publishAt}
        extra={false}
      />
    );
  };
  return (
    <Panel
      open
      title={t('notices.versionTitle', { d: formatSessionTime(version.replacedAt) })}
      sub={version.editedByEmail ?? undefined}
      onClose={onClose}
      footer={
        <Button
          type="button"
          tone="outline"
          small
          fit
          className="flex-1 sm:flex-none"
          onClick={onClose}
        >
          {t('common.close')}
        </Button>
      }
    >
      <div className={CAPTION}>{t('notices.inBn')}</div>
      {card('bn')}
      <div className={CAPTION}>{t('notices.inEn')}</div>
      {card('en')}
    </Panel>
  );
}

/** NTC-08: gone from every shop at once, kept here. */
function WithdrawPanel({
  notice,
  onClose,
}: {
  notice: OperatorNoticeDetail;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const withdraw = useWithdrawNotice();
  return (
    <ActionPanel
      title={t('notices.withdrawTitle')}
      sub={titleIn(notice, i18n.language)}
      onClose={onClose}
      actionLabel={t('notices.withdraw')}
      danger
      pending={withdraw.isPending}
      error={withdraw.isError ? errorMessage(withdraw.error, t) : null}
      onSubmit={() => {
        withdraw.mutate(notice.id, {
          onSuccess: () => {
            toast(t('notices.withdrawnToast'));
            onClose();
          },
        });
      }}
    >
      <Consequence tone="danger">{t('notices.withdrawConsequence')}</Consequence>
      <div className={NOTE}>{t('notices.withdrawAudit')}</div>
    </ActionPanel>
  );
}

/** The rate change a notice tells of, opening that rate's history (RAT-09). */
function RateChangeFact({ id }: { id: number }): React.JSX.Element {
  const { t } = useTranslation();
  const { change } = useRateChange(id);
  if (!change) return <>…</>;
  return (
    <Link to="/rates" search={{ history: change.key }} className="text-primary underline">
      {t(`rateNames.${change.key}`)}{' '}
      {change.oldValue === null ? '–' : rateWords(change.key, change.oldValue)} →{' '}
      {rateWords(change.key, change.newValue)} · {formatDay(change.changedAt)}
    </Link>
  );
}

/**
 * NTC-05, NTC-08, NTC-09 (OPERATOR-CONSOLE-DESIGN §10c): one notice -- where it stands, what came of it, both languages
 * as written, its earlier versions and how it is set.
 */
export function NoticeDetail({ notice }: { notice: OperatorNoticeDetail }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<'withdraw' | NoticeVersion | null>(null);
  const sent = notice.status !== NoticeStatus.Draft && notice.status !== NoticeStatus.Scheduled;
  const acknowledgments = useNoticeAcknowledgments(notice.id, sent && notice.requiresAck);
  const pending = acknowledgments.data?.pendingCount ?? 0;
  const closed = notice.status === NoticeStatus.Withdrawn || notice.status === NoticeStatus.Ended;
  const title = titleIn(notice, i18n.language);
  const n = (value: number): string => value.toLocaleString('en-US');

  const actions = closed ? undefined : (
    <>
      {notice.requiresAck && sent ? (
        <Button
          type="button"
          tone="outline"
          small
          fit
          className={ACTION}
          onClick={() => {
            void navigate({ to: '/notices/$id/acknowledgments', params: { id: notice.id } });
          }}
        >
          {t('notices.acknowledgments')}
        </Button>
      ) : null}
      <Button
        type="button"
        tone="outline"
        small
        fit
        className={ACTION}
        onClick={() => {
          void navigate({ to: '/notices/$id/edit', params: { id: notice.id } });
        }}
      >
        <ConsoleIcon name="edit" size={18} />
        {t('common.edit')}
      </Button>
      <Button
        type="button"
        tone="ghost"
        small
        fit
        className={`${ACTION} ${QUIET_BUTTON}`}
        onClick={() => {
          setPanel('withdraw');
        }}
      >
        {t('notices.withdraw')}
      </Button>
    </>
  );

  const banner =
    notice.status === NoticeStatus.Scheduled ? (
      <Banner tone="info" icon="clock">
        {t('notices.scheduledBanner', { d: formatSessionTime(notice.publishAt ?? '') })}
      </Banner>
    ) : notice.status === NoticeStatus.Withdrawn ? (
      <Banner tone="warn" icon="info">
        {t('notices.withdrawnBanner', { d: formatSessionTime(notice.withdrawnAt ?? '') })}
      </Banner>
    ) : notice.status === NoticeStatus.Ended ? (
      <Banner tone="info" icon="info">
        {t('notices.endedBanner', { d: formatSessionTime(notice.endsAt ?? '') })}
      </Banner>
    ) : null;

  const words = (language: 'bn' | 'en') => {
    const written = language === 'bn' ? notice.titleBn : notice.titleEn;
    const body = language === 'bn' ? notice.bodyBn : notice.bodyEn;
    return (
      <ConsoleCard>
        <SectionTitle>{t(language === 'bn' ? 'notices.inBn' : 'notices.inEn')}</SectionTitle>
        {written ? (
          <>
            <div className="mt-2 text-[16px] leading-[1.35] font-semibold [overflow-wrap:anywhere]">
              {written}
            </div>
            <div className="mt-1.5">
              <NoticeBody body={body ?? ''} />
            </div>
          </>
        ) : (
          <div className={`${NOTE} mt-2`}>{t('notices.missingLanguage')}</div>
        )}
      </ConsoleCard>
    );
  };

  return (
    <ConsolePage>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <Link to="/notices" className="text-primary">
          {t('nav.notices')}
        </Link>
        <ConsoleIcon name="chev" />
        <span className="min-w-0 truncate">{title}</span>
      </div>
      <PageTitle
        title={title}
        before={<PinMark pinned={notice.pinned} />}
        lead={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <NoticeStatusChip status={notice.status} />
            <SeverityChip severity={notice.severity} />
            <StatusChip tone="mute" plain>
              {t(`notices.categories.${notice.category}`)}
            </StatusChip>
            {notice.editedAt ? (
              <StatusChip tone="mute" plain>
                {t('notices.updated', { d: formatSessionTime(notice.editedAt) })}
              </StatusChip>
            ) : null}
          </span>
        }
        actions={actions}
      />
      {banner}
      {sent ? (
        <Figures>
          <Figure
            label={t('notices.figureSent')}
            value={n(notice.counts.shops)}
            detail={t('notices.figureSentDetail')}
          />
          <Figure
            label={t('notices.figurePeople')}
            value={n(notice.counts.people)}
            detail={t('notices.figurePeopleDetail')}
          />
          <Figure
            label={t('notices.figureReads')}
            value={n(notice.counts.reads)}
            detail={t('notices.figureReadsDetail')}
          />
          {notice.requiresAck ? (
            <Link
              to="/notices/$id/acknowledgments"
              params={{ id: notice.id }}
              className={figureBox(pending > 0)}
            >
              <FigureBody
                label={t('notices.figureAck')}
                value={n(notice.counts.acknowledged)}
                detail={t('notices.figureAckDetail', { p: n(pending) })}
                flagged={pending > 0}
              />
            </Link>
          ) : (
            <Figure label={t('notices.figureAck')} value="—" detail={t('notices.figureNoAck')} />
          )}
        </Figures>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {words('bn')}
          {words('en')}
          {sent ? (
            <ConsoleCard>
              <SectionTitle>{t('notices.versions')}</SectionTitle>
              <div className="mt-1 text-[13px] leading-[1.5] text-fg-muted">
                {t('notices.versionsHint')}
              </div>
              {notice.versions.length ? (
                <div className="-mx-4 mt-2 -mb-4 flex flex-col">
                  {notice.versions.map((version) => (
                    <div
                      key={version.replacedAt}
                      className="flex min-h-[60px] flex-wrap items-center gap-3 border-t border-line px-4 py-3"
                    >
                      <span className="min-w-0 flex-1 text-[15px] font-medium">
                        {t('notices.versionLine', {
                          d: formatSessionTime(version.replacedAt),
                          who: version.editedByEmail ?? '—',
                        })}
                      </span>
                      <Button
                        type="button"
                        tone="outline"
                        small
                        fit
                        className="min-h-8! px-2.5! text-[13px]!"
                        onClick={() => {
                          setPanel(version);
                        }}
                      >
                        {t('notices.versionOpen')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${NOTE} mt-2`}>{t('notices.noVersions')}</div>
              )}
            </ConsoleCard>
          ) : null}
        </div>
        <ConsoleCard>
          <h3 className="mb-1 text-[16px] font-semibold">{t('notices.facts')}</h3>
          <div className="mt-2.5">
            <KeyValues>
              <KeyValue label={t('notices.cAudience')}>
                <AudienceWords audience={notice.audience} />
              </KeyValue>
              <KeyValue label={sent ? t('notices.factWentLive') : t('notices.factGoesLive')}>
                {notice.publishAt ? formatSessionTime(notice.publishAt) : t('notices.factNever')}
              </KeyValue>
              <KeyValue label={t('notices.factEnds')}>
                {notice.endsAt ? formatSessionTime(notice.endsAt) : t('notices.factNever')}
              </KeyValue>
              {notice.windowStartsAt && notice.windowEndsAt ? (
                <KeyValue label={t('notices.factWindow')}>
                  {formatSessionTime(notice.windowStartsAt)} –{' '}
                  {formatSessionTime(notice.windowEndsAt)}
                </KeyValue>
              ) : null}
              <KeyValue label={t('notices.factPinned')}>
                {notice.pinned ? t('notices.yes') : t('notices.no')}
              </KeyValue>
              <KeyValue label={t('notices.factAck')}>
                {notice.requiresAck ? t('notices.asked') : t('notices.no')}
              </KeyValue>
              <KeyValue label={t('notices.factEmail')}>
                {notice.severity === NoticeSeverity.Info
                  ? t('notices.factEmailNo')
                  : t('notices.factEmailYes')}
              </KeyValue>
              {notice.rateChangeId !== null ? (
                <KeyValue label={t('notices.factRate')}>
                  <RateChangeFact id={notice.rateChangeId} />
                </KeyValue>
              ) : null}
              <KeyValue label={t('notices.factBy')}>
                {[notice.createdByEmail, formatSessionTime(notice.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              </KeyValue>
            </KeyValues>
          </div>
        </ConsoleCard>
      </div>
      {panel === 'withdraw' ? (
        <WithdrawPanel
          notice={notice}
          onClose={() => {
            setPanel(null);
          }}
        />
      ) : null}
      {panel !== null && panel !== 'withdraw' ? (
        <VersionPanel
          notice={notice}
          version={panel}
          onClose={() => {
            setPanel(null);
          }}
        />
      ) : null}
    </ConsolePage>
  );
}
