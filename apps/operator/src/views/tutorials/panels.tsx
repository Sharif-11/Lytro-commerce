import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner } from '@lytronix/ui';
import { TUTORIAL_CONTENT_TYPE } from '@lytronix/validators';
import { useRemoveTutorial, useUploadTutorial, type UploadStage } from '@/api/tutorials';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { Panel } from '@/components/ui/panel';
import { useToast } from '@/components/ui/use-toast';
import { checksOf, readTutorialFile, type TutorialFileFacts } from '@/lib/tutorial-file';
import type { TutorialRow } from '.';
import { lengthOf, megabytes, useTutorialWords } from './words';

// The sketch's `.tvo-rules`: a soft grey box of small words.
const RULES = 'rounded-[8px] bg-neutral-50 px-3 py-2.5 text-[13px] leading-[1.55] text-fg-muted';
const ICON_BUTTON =
  'inline-flex size-9 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100';

/** The sketch's `.tvo-kv`: a label and its value on one line, a hairline above all but the first. */
function KeyValue({ label, children }: { label: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line py-1 text-[14px] first:border-t-0">
      <span className="flex-none text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

/** One of the three checks (`.tvo-ck`): a tick, or a warning in red. */
function Check({ ok, children }: { ok: boolean; children: ReactNode }): React.JSX.Element {
  return (
    <div
      className={`flex items-start gap-2 text-[14px] ${ok ? '' : 'font-semibold text-danger-text'}`}
      data-check={ok ? 'ok' : 'bad'}
    >
      <span className={`mt-px flex-none ${ok ? 'text-success' : ''}`}>
        <ConsoleIcon name={ok ? 'check' : 'warn'} size={18} />
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Cancel and the panel's one action, side by side (as ActionPanel's). */
function Footer({
  label,
  icon,
  danger = false,
  disabled,
  pending,
  onCancel,
  onAct,
}: {
  label: string;
  icon: 'upload' | 'trash';
  danger?: boolean;
  disabled: boolean;
  pending: boolean;
  onCancel: () => void;
  onAct: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <Button
        type="button"
        tone="outline"
        small
        fit
        disabled={pending}
        className="flex-1 sm:flex-none"
        onClick={onCancel}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        tone={danger ? 'danger' : 'primary'}
        small
        fit
        disabled={disabled || pending}
        className="flex-1 sm:flex-none"
        onClick={onAct}
      >
        <ConsoleIcon name={icon} size={18} />
        {label}
      </Button>
    </>
  );
}

/**
 * §10h's Upload and Replace (the sketch's `tv-upload`, `tv-upload-bad`, `tv-replace`): the chosen file with its length,
 * size and shape, the three checks -- portrait 9:16, MP4 with H.264 and AAC, up to 80 MB -- then the length read from the
 * file, the name it will be saved as and the screens it will show on. A file that fails a check keeps the button off.
 * Replacing shows the live file and says why the name moves on, that the old file goes 7 days later and that sellers keep
 * their ✓.
 */
export function FilePanel({
  item,
  replace,
  onClose,
}: {
  item: TutorialRow;
  replace: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { language, words, title } = useTutorialWords();
  const picker = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [facts, setFacts] = useState<TutorialFileFacts | null>(null);
  const [reading, setReading] = useState(false);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const upload = useUploadTutorial(item.part.key, setStage);
  const { part, row } = item;
  const checks = facts ? checksOf(facts) : null;
  const passes = checks !== null && checks.shape && checks.codecs && checks.size;
  const size =
    facts?.width && facts.height ? `${String(facts.width)} × ${String(facts.height)}` : '';
  const pending = upload.isPending;

  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    setFile(chosen);
    setFacts(null);
    upload.reset();
    setReading(true);
    try {
      setFacts(await readTutorialFile(chosen));
    } finally {
      setReading(false);
    }
  };

  const shapeLine = (): string => {
    if (!facts?.width || !facts.height) return t('tutorials.shapeUnknown');
    if (checks?.shape) return t('tutorials.shapeOk', { size });
    return facts.width > facts.height
      ? t('tutorials.shapeLandscape', { size })
      : t('tutorials.shapeOther', { size });
  };

  const actionLabel =
    stage?.step === 'sending'
      ? t('tutorials.sending', { p: String(Math.round(stage.share * 100)) })
      : stage?.step === 'checking'
        ? t('tutorials.checking')
        : replace
          ? t('tutorials.replaceButton')
          : t('tutorials.uploadButton');

  return (
    <Panel
      open
      title={replace ? t('tutorials.replaceTitle') : t('tutorials.uploadTitle')}
      sub={title(part)}
      onClose={onClose}
      dismissable={!pending}
      footerInRow
      footer={
        <Footer
          label={actionLabel}
          icon="upload"
          disabled={!passes || file === null}
          pending={pending}
          onCancel={onClose}
          onAct={() => {
            if (!file) return;
            upload.mutate(file, {
              onSuccess: () => {
                toast(
                  replace
                    ? t('tutorials.replaced', { n: words(part.part) })
                    : t('tutorials.uploaded', { n: words(part.part), where: words(part.where) }),
                );
                onClose();
              },
              onSettled: () => {
                setStage(null);
              },
            });
          }}
        />
      }
    >
      <div className="flex flex-col gap-2.5">
        {replace && row.video ? (
          <KeyValue label={t('tutorials.kLiveNow')}>
            <span className="mono text-right text-[12px] break-all">
              {row.video.file} · {lengthOf(row.video.durationSeconds, language)}
            </span>
          </KeyValue>
        ) : null}
        <input
          ref={picker}
          type="file"
          accept={`${TUTORIAL_CONTENT_TYPE},.mp4`}
          className="sr-only"
          aria-label={t('tutorials.choose')}
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {file ? (
          <div className="flex items-center gap-3 rounded-[10px] border-[1.5px] border-brand-300 bg-brand-50 px-3 py-2.5">
            {facts?.thumb ? (
              <img
                src={facts.thumb}
                alt=""
                className="h-16 w-9 flex-none rounded-[5px] bg-neutral-100 object-cover"
              />
            ) : (
              <span className="flex h-16 w-9 flex-none items-center justify-center rounded-[5px] bg-brand-700 text-white">
                <ConsoleIcon name="play" size={16} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="mono overflow-hidden text-[13px] text-ellipsis whitespace-nowrap">
                {file.name}
              </b>
              <span className="text-[13px] text-fg-muted">
                {reading || !facts
                  ? t('tutorials.reading')
                  : [
                      facts.durationSeconds === null
                        ? null
                        : lengthOf(facts.durationSeconds, language),
                      size || null,
                      `${megabytes(facts.bytes)} MB`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </span>
            <button
              type="button"
              title={t('tutorials.chooseAnother')}
              aria-label={t('tutorials.chooseAnother')}
              disabled={pending}
              className={ICON_BUTTON}
              onClick={() => picker.current?.click()}
            >
              <ConsoleIcon name="x" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-line-strong px-3 py-2.5">
            <span className="flex h-16 w-9 flex-none items-center justify-center rounded-[5px] bg-neutral-100 text-neutral-700">
              <ConsoleIcon name="upload" size={16} />
            </span>
            <span className="flex-1 text-[13px] text-fg-muted">{t('tutorials.rules')}</span>
            <Button type="button" tone="outline" small fit onClick={() => picker.current?.click()}>
              {t('tutorials.choose')}
            </Button>
          </div>
        )}
        {facts && checks ? (
          <>
            <Check ok={checks.shape}>{shapeLine()}</Check>
            <Check ok={checks.codecs}>
              {checks.codecs ? t('tutorials.codecsOk') : t('tutorials.codecsBad')}
            </Check>
            <Check ok={checks.size}>
              {checks.size
                ? t('tutorials.sizeOk', { mb: megabytes(facts.bytes) })
                : t('tutorials.sizeBad', { mb: megabytes(facts.bytes) })}
            </Check>
          </>
        ) : null}
        {facts && passes ? (
          <div className="flex flex-col">
            {replace ? null : (
              <KeyValue label={t('tutorials.kLength')}>
                <b>
                  {facts.durationSeconds === null ? '—' : lengthOf(facts.durationSeconds, language)}
                </b>
              </KeyValue>
            )}
            <KeyValue label={t('tutorials.kSavedAs')}>
              <span className="mono text-right text-[12px] break-all">{row.nextFile}</span>
            </KeyValue>
            {replace ? null : (
              <KeyValue label={t('tutorials.kShowsOn')}>
                <b>{words(part.where)}</b>
              </KeyValue>
            )}
          </div>
        ) : null}
        {replace ? <div className={RULES}>{t('tutorials.replaceRules')}</div> : null}
        {!replace && facts && !passes ? <div className={RULES}>{t('tutorials.rules')}</div> : null}
        {upload.isError ? <ErrorBanner message={errorMessage(upload.error, t)} /> : null}
      </div>
    </Panel>
  );
}

/** §10h's Remove (the sketch's `tv-remove`): what leaves the sellers' app, and that the file goes 7 days later. */
export function RemovePanel({
  item,
  onClose,
}: {
  item: TutorialRow;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const { words, title } = useTutorialWords();
  const remove = useRemoveTutorial(item.part.key);
  return (
    <Panel
      open
      title={t('tutorials.removeTitle')}
      sub={title(item.part)}
      onClose={onClose}
      dismissable={!remove.isPending}
      footerInRow
      footer={
        <Footer
          label={t('tutorials.remove')}
          icon="trash"
          danger
          disabled={false}
          pending={remove.isPending}
          onCancel={onClose}
          onAct={() => {
            remove.mutate(undefined, {
              onSuccess: () => {
                toast(t('tutorials.removed', { n: words(item.part.part) }));
                onClose();
              },
            });
          }}
        />
      }
    >
      <div className="flex flex-col gap-2.5">
        <div className={RULES}>{t('tutorials.removeText', { where: words(item.part.where) })}</div>
        {remove.isError ? <ErrorBanner message={errorMessage(remove.error, t)} /> : null}
      </div>
    </Panel>
  );
}

/** §10h's Watch (the sketch's `tv-preview`): the live file in the sellers' own player, at the same size. */
export function PreviewPanel({
  item,
  onClose,
}: {
  item: TutorialRow;
  onClose: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const { language, title } = useTutorialWords();
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const live = item.row.video;
  if (!live) return null;
  const share = live.durationSeconds > 0 ? Math.min(1, time / live.durationSeconds) : 0;
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };
  return (
    <Panel
      open
      title={title(item.part)}
      sub={
        <>
          {lengthOf(live.durationSeconds, language)} · <span className="mono">{live.file}</span>
        </>
      }
      onClose={onClose}
      footer={
        <Button type="button" tone="outline" small fit onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <div className="relative aspect-[9/16] w-[270px] max-w-full overflow-hidden rounded-[12px] bg-black">
          <video
            ref={video}
            src={live.url}
            poster={live.coverUrl}
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
              setTime(event.currentTarget.currentTime);
            }}
            className="size-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-b from-transparent to-black/70 px-3 py-2.5 text-[12px] text-white">
            <button
              type="button"
              aria-label={playing ? t('tutorials.pause') : t('tutorials.play')}
              onClick={toggle}
              className="flex flex-none"
            >
              <ConsoleIcon name={playing ? 'pause' : 'play'} size={18} />
            </button>
            <span className="tabular-nums">{lengthOf(time, language)}</span>
            <span className="h-1 flex-1 overflow-hidden rounded-[2px] bg-white/[.35]">
              <i className="block h-full bg-white" style={{ width: `${String(share * 100)}%` }} />
            </span>
            <span className="tabular-nums">{lengthOf(live.durationSeconds, language)}</span>
          </div>
        </div>
        <div className={`${RULES} w-full`}>{t('tutorials.previewNote')}</div>
      </div>
    </Panel>
  );
}
