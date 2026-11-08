import { useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useDismissNotice } from '@/api/notices';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/dates';
import { serviceWorker } from '@/lib/service-worker';
import { useShell } from '@/shell/shell-context';
import type { NoticeBrief, NoticeCountdown, NoticeSummary } from '@/types/notices';
import { CATEGORY_WORD, useMinuteClock, useUntil, useWindowWords } from './notice-words';

/**
 * The urgent marquee (Part 37's `p37-marquee`, NTC-04, D7-54): a red band under the bars on every page, scrolling the
 * urgent notices until the person closes it; tapping it opens the notice. Still when the person asks for reduced motion.
 */
function Marquee({ banners }: { banners: NoticeBrief[] }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { slug, showToast } = useShell();
  const navigate = useNavigate();
  const dismiss = useDismissNotice();
  const first = banners[0];
  const run = banners.map((banner) => (
    <span key={banner.id} className="flex-none">
      {banner.title}
    </span>
  ));
  return (
    <div
      role="marquee"
      aria-label={t('p37SevUrgent')}
      className="flex h-11 flex-none cursor-pointer items-center gap-2 overflow-hidden bg-danger pr-1 pl-3 text-white"
      onClick={() => {
        if (first)
          void navigate({
            to: '/$shop/notices/$noticeId',
            params: { shop: slug, noticeId: first.id },
          });
      }}
    >
      <span className="inline-flex flex-none items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-bold">
        <Icon name="megaphone" size={14} /> {t('p37SevUrgent')}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
        <span className="inline-flex animate-[p37-marquee_24s_linear_infinite] gap-12 pl-1 text-[14px] font-semibold motion-reduce:animate-none">
          {run}
          <span aria-hidden="true" className="inline-flex gap-12">
            {run}
          </span>
        </span>
      </span>
      <button
        type="button"
        aria-label={t('p37MqClose')}
        className="inline-flex size-10 flex-none items-center justify-center rounded-[8px] text-white"
        onClick={(event) => {
          event.stopPropagation();
          for (const banner of banners) dismiss.mutate(banner.id);
          showToast(t('p37MqClosed'));
        }}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

/**
 * The maintenance band (Part 37's `p37-maint`, NTC-14, D7-55): from publishing to the window's end, counting down to its
 * start, then saying it is under way.
 */
function MaintenanceBand({ window }: { window: NoticeCountdown }): React.JSX.Element {
  const { t, i18n } = useTranslation('shell');
  const { slug } = useShell();
  const now = useMinuteClock();
  const until = useUntil();
  const words = useWindowWords();
  const underWay = window.underWay || Date.parse(window.startsAt) <= now;
  const details = (
    <Link
      to="/$shop/notices/$noticeId"
      params={{ shop: slug, noticeId: window.id }}
      className="font-bold whitespace-nowrap text-inherit underline"
    >
      {t('p37MaintSee')}
    </Link>
  );
  if (underWay) {
    return (
      <div className="flex min-h-11 flex-none items-center gap-2.5 bg-accent-soft py-2 pr-3 pl-4 text-[14px] leading-[1.45] text-accent-text">
        <Icon name="clock" />
        <span className="min-w-0 flex-1">
          {t('p37MaintNow', { e: formatTime(window.endsAt, i18n.language) })}
        </span>
        {details}
      </div>
    );
  }
  return (
    <div className="flex min-h-11 flex-none items-center gap-2.5 bg-brand-900 py-2 pr-3 pl-4 text-[14px] leading-[1.45] text-white">
      <Icon name="clock" />
      <span className="min-w-0 flex-1">
        <b>{t('p37MaintIn')}</b>{' '}
        {t('p37MaintInB', { t: until(window.startsAt, now), w: words(window) })}
      </span>
      {details}
    </div>
  );
}

/** The bands under the bars on every page: the urgent marquee, then the maintenance countdown. */
export function NoticeBands({
  summary,
}: {
  summary: NoticeSummary | undefined;
}): React.JSX.Element | null {
  if (!summary) return null;
  const maintenance = summary.maintenance;
  if (summary.banners.length === 0 && !maintenance) return null;
  return (
    <>
      {summary.banners.length > 0 ? <Marquee banners={summary.banners} /> : null}
      {maintenance ? <MaintenanceBand window={maintenance} /> : null}
    </>
  );
}

const PROMPTED_KEY = 'lytro.notices.prompted';

/** The notices already prompted in this sign-in's tab, so a prompt shows once (NTC-04). */
function promptedSoFar(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(PROMPTED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * The important prompt (Part 37's `p37-prompt`, NTC-04, D7-54): a dialog at the next sign-in for each important notice
 * the person hasn't read or closed, "1 of 2", with Later (closes it for good) and Read it.
 */
export function ImportantPrompt({ prompts }: { prompts: NoticeBrief[] }): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const { slug } = useShell();
  const navigate = useNavigate();
  const dismiss = useDismissNotice();
  const [shown, setShown] = useState<string[]>(promptedSoFar);
  const waiting = prompts.filter((prompt) => !shown.includes(prompt.id));
  const prompt = waiting[0];
  if (!prompt) return null;
  const total = prompts.length;
  const position = total - waiting.length + 1;
  const close = (): void => {
    const next = [...shown, prompt.id];
    setShown(next);
    try {
      sessionStorage.setItem(PROMPTED_KEY, JSON.stringify(next));
    } catch {
      // Without storage the prompt may show again on a reload; it still closes now.
    }
  };
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(16,32,31,0.45)] px-4 pb-[20vh] sm:pb-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="p37-prompt-title"
        className="flex w-full max-w-[400px] flex-col gap-2.5 rounded-[16px] bg-surface p-5 shadow-[0_24px_60px_-20px_rgba(16,32,31,0.45)] [html[lang=bn]_&]:leading-[1.6]"
      >
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-text">
          <Icon name="megaphone" size={16} />
          {t('p37BellLytro')} · {t('p37SevImportant')} · {t(CATEGORY_WORD[prompt.category])}
          <span className="num ml-auto">{t('p37PromptOf', { n: position, t: total })}</span>
        </div>
        <h2 id="p37-prompt-title" dir="auto" className="text-[18px] font-bold">
          {prompt.title}
        </h2>
        <div className="mt-1.5 flex flex-wrap justify-end gap-2">
          <Button
            tone="outline"
            size="sm"
            onClick={() => {
              dismiss.mutate(prompt.id);
              close();
            }}
          >
            {t('p37PromptLater')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              close();
              void navigate({
                to: '/$shop/notices/$noticeId',
                params: { shop: slug, noticeId: prompt.id },
              });
            }}
          >
            {t('p37PromptRead')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The update prompt (Part 37's `p37-update`, NTF-07, D7-44): kept until tapped, above the tab bar or bottom right. */
export function UpdatePrompt(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const ready = useSyncExternalStore(serviceWorker.subscribe, serviceWorker.updateReady);
  if (!ready) return null;
  return (
    <div
      role="status"
      className="fixed right-3 bottom-[76px] left-3 z-30 flex items-center gap-3 rounded-[12px] bg-ink py-2.5 pr-2.5 pl-4 text-white shadow-[0_12px_32px_-8px_rgba(16,32,31,0.5)] lg:right-8 lg:bottom-8 lg:left-auto lg:w-[400px]"
    >
      <span className="min-w-0 flex-1 text-[14px] leading-[1.4]">
        {t('p37UpdateB')}
        <small className="block text-[13px] text-neutral-200">{t('p37UpdateForm')}</small>
      </span>
      <Button
        size="sm"
        className="flex-none !bg-brand-300 !text-ink"
        onClick={() => {
          serviceWorker.update();
        }}
      >
        {t('p37UpdateBtn')}
      </Button>
    </div>
  );
}
