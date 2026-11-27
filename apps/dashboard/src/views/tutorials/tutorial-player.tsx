import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  TUTORIAL_SERIES,
  TUTORIAL_WATCHED_SHARE,
  tutorialPartOf,
  type TutorialKey,
} from '@lytronix/validators';
import { useMarkTutorialWatched, useTutorials } from '@/api/tutorials';
import { Icon } from '@/components/icon';
import { useShell } from '@/shell/shell-context';
import { lengthOf, wordsIn } from './words';

// The sketch's `.tv-tt span`, `.tv-next span`: a light grey on black.
const SOFT = 'text-[#d5dfde]';

/**
 * Lytro's own tutorial player (TENANT-DASHBOARD-DESIGN §7.49, the prototype's `tv-player`, `tv-player-end`), never
 * YouTube: full screen and black, the 9:16 video filling the height; on a computer the same in the middle, 420 px wide,
 * over a dark backdrop. The part and its length on top, the controls on the video, and under it the next part that has a
 * file and "সব টিউটোরিয়াল". At the end the video dims under "আবার দেখুন" and the next part. A video counts as watched
 * once it has played to the end or past 90 percent. It streams with range requests, so only what is watched is fetched.
 */
export function TutorialPlayer({
  tutorialKey,
  onPlay,
  onClose,
}: {
  tutorialKey: TutorialKey;
  onPlay: (key: TutorialKey) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('tutorials');
  const language = i18n.language;
  const navigate = useNavigate();
  const { slug } = useShell();
  const tutorials = useTutorials();
  const watched = useMarkTutorialWatched();
  const video = useRef<HTMLVideoElement>(null);
  const counted = useRef(false);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [ended, setEnded] = useState(false);

  const parts = tutorials.data?.parts ?? [];
  const item = parts.find((each) => each.key === tutorialKey);
  const part = tutorialPartOf(tutorialKey);
  const at = TUTORIAL_SERIES.findIndex((each) => each.key === tutorialKey);
  const next = TUTORIAL_SERIES.slice(at + 1).find((each) =>
    parts.some((one) => one.key === each.key && one.video !== null),
  );

  // A new part starts from its beginning.
  useEffect(() => {
    counted.current = false;
    setEnded(false);
    setTime(0);
    setPlaying(true);
  }, [tutorialKey]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  if (!part || !item?.video) return null;
  const length = item.video.durationSeconds;
  const title = `${t('part', { n: wordsIn(part.part, language) })} · ${wordsIn(part.name, language)}`;
  const nextTitle = next
    ? `${t('part', { n: wordsIn(next.part, language) })} · ${wordsIn(next.name, language)}`
    : null;

  const count = () => {
    if (counted.current) return;
    counted.current = true;
    watched.mutate(tutorialKey);
  };
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };
  const again = () => {
    const element = video.current;
    setEnded(false);
    if (!element) return;
    element.currentTime = 0;
    void element.play().catch(() => undefined);
  };
  const all = () => {
    onClose();
    void navigate({ to: '/$shop/tutorials', params: { shop: slug } });
  };
  const share = length > 0 ? Math.min(1, time / length) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white lg:items-center lg:bg-black/[.88]"
    >
      <div className="flex flex-none items-center gap-2.5 px-3 py-2.5 lg:w-[420px]">
        <button
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          className="flex size-10 flex-none items-center justify-center rounded-full bg-white/[.14] text-white"
        >
          <Icon name="x" />
        </button>
        <div className="flex min-w-0 flex-col">
          <b className="overflow-hidden text-[15px] text-ellipsis whitespace-nowrap">{title}</b>
          <span className={`text-[13px] ${SOFT}`}>{lengthOf(length, language)}</span>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center lg:w-[420px]">
        <video
          ref={video}
          key={item.video.url}
          src={item.video.url}
          poster={item.video.coverUrl}
          autoPlay
          playsInline
          preload="metadata"
          onClick={toggle}
          onPlay={() => {
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onTimeUpdate={(event) => {
            const now = event.currentTarget.currentTime;
            setTime(now);
            if (length > 0 && now >= length * TUTORIAL_WATCHED_SHARE) count();
          }}
          onEnded={() => {
            count();
            setEnded(true);
          }}
          className={[
            'aspect-[9/16] h-full max-w-full rounded-[8px] object-cover',
            ended ? 'brightness-[.35]' : '',
          ].join(' ')}
        />
        {ended ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
            <button
              type="button"
              onClick={again}
              className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-button border border-line-strong bg-surface px-3.5 text-[14px] font-semibold text-fg-muted"
            >
              <Icon name="undo" size={16} />
              {t('again')}
            </button>
            {next && nextTitle ? (
              <button
                type="button"
                onClick={() => {
                  onPlay(next.key);
                }}
                className="inline-flex h-9 max-w-full items-center justify-center gap-2 rounded-button bg-primary px-3.5 text-[14px] font-semibold text-on-primary"
              >
                {t('next')}: {nextTitle}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="absolute right-3 bottom-2.5 left-3 flex items-center gap-2.5 rounded-full bg-black/[.55] px-3 py-1.5">
            <button
              type="button"
              aria-label={playing ? t('pause') : t('play')}
              onClick={toggle}
              className="flex text-white"
            >
              <Icon name={playing ? 'pause' : 'play'} size={20} />
            </button>
            <span className="text-[12px] text-white tabular-nums">{lengthOf(time, language)}</span>
            <span className="relative h-1 flex-1 overflow-hidden rounded-[2px] bg-white/[.35]">
              <i className="block h-full bg-accent" style={{ width: `${String(share * 100)}%` }} />
              <input
                type="range"
                min={0}
                max={length}
                step={1}
                value={Math.round(time)}
                aria-label={t('seek')}
                aria-valuetext={`${lengthOf(time, language)} / ${lengthOf(length, language)}`}
                onChange={(event) => {
                  const element = video.current;
                  if (element) element.currentTime = Number(event.target.value);
                }}
                className="absolute inset-0 -my-2 h-5 w-full cursor-pointer opacity-0"
              />
            </span>
            <span className="text-[12px] text-white tabular-nums">
              {lengthOf(length, language)}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2 px-3 pt-2.5 pb-3.5 lg:w-[420px]">
        {next && nextTitle ? (
          <button
            type="button"
            onClick={() => {
              onPlay(next.key);
            }}
            className="flex w-full items-center gap-2.5 rounded-[12px] bg-white/[.12] px-3.5 py-2.5 text-left text-white"
          >
            <span className={`flex-none text-[13px] ${SOFT}`}>{t('next')}</span>
            <b className="min-w-0 flex-1 overflow-hidden text-[15px] text-ellipsis whitespace-nowrap">
              {nextTitle}
            </b>
            <Icon name="right" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={all}
          className="inline-flex items-center gap-1.5 self-center p-1 text-[14px] font-semibold text-white"
        >
          <Icon name="list" size={16} />
          {t('all')}
        </button>
      </div>
    </div>
  );
}
