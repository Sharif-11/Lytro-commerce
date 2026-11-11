import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EVIDENCE_CONTENT_TYPES, EVIDENCE_MAX_BYTES } from '@lytronix/validators';
import { ScreenshotNotSent, useSendPaymentScreenshot } from '@/api/billing';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { dayLabel, formatDayMonth, formatTime } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { BillingPayment } from '@/types/billing';

const MB = 1024 * 1024;

/** A file's size as the card writes it: "1.2 MB". */
function sizeOf(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Where the card has got to with a file the seller chose. */
type Step =
  | { kind: 'none' }
  | { kind: 'big'; size: string }
  | { kind: 'type' }
  | { kind: 'uploading'; file: File; fraction: number }
  | { kind: 'failed'; file: File; message: string };

/** The file as a row (the prototype's `.p88file`): its name and size, and what it has become. */
function FileRow({
  name,
  size,
  children,
}: {
  name: string;
  size: string | null;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-[10px] border border-line px-3 py-2.5">
      <Icon name="image" size={22} className="flex-none text-neutral-700" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="overflow-hidden text-[15px] font-semibold text-ellipsis whitespace-nowrap">
          {name}
        </span>
        {size ? <span className="num text-[13px] text-neutral-700">{size}</span> : null}
      </span>
      {children}
    </div>
  );
}

/**
 * ADM-17, D8-15 (Slice 8.8, TENANT-DASHBOARD-DESIGN §7.41, the prototype's `p88ShotCard`): a screenshot for a payment Lytro
 * is checking. Optional and seen only by Lytro; a picture or a PDF up to 5 MB, refused before it uploads otherwise. It
 * uploads with a bar, then shows as Sent. One a payment, and once sent it stays. `mayAct` is whether this person may send
 * one; without it only a screenshot already sent shows.
 */
export function ScreenshotCard({
  payment,
  mayAct,
}: {
  payment: BillingPayment;
  mayAct: boolean;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const { showToast } = useShell();
  const send = useSendPaymentScreenshot();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'none' });
  // The file just sent, for its name and size; the server keeps neither, only when it came.
  const [sent, setSent] = useState<{ file: File; at: string } | null>(null);

  const sentAt = payment.evidenceSentAt ?? sent?.at ?? null;
  if (sentAt === null && !mayAct) return null;

  function upload(file: File): void {
    setStep({ kind: 'uploading', file, fraction: 0 });
    send.mutate(
      {
        payment,
        file,
        onSent: (fraction) => {
          setStep({ kind: 'uploading', file, fraction });
        },
      },
      {
        onSuccess: ({ evidenceSentAt }) => {
          setSent({ file, at: evidenceSentAt });
          setStep({ kind: 'none' });
          showToast(t('p88money.shotSentToast'));
        },
        onError: (error) => {
          setStep({
            kind: 'failed',
            file,
            message:
              error instanceof ScreenshotNotSent ? t('p88money.shotFailed') : errorText(error),
          });
        },
      },
    );
  }

  function choose(file: File | undefined): void {
    if (!file) return;
    if (!(EVIDENCE_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setStep({ kind: 'type' });
    } else if (file.size > EVIDENCE_MAX_BYTES) {
      setStep({ kind: 'big', size: sizeOf(file.size) });
    } else {
      upload(file);
    }
  }

  function pick(): void {
    input.current?.click();
  }

  const lead = <p className="mt-1 mb-2.5 text-[14px] text-fg-muted">{t('p88money.shotLead')}</p>;
  const another = (
    <Button tone="outline" size="sm" onClick={pick}>
      <Icon name="image" />
      {t('p88money.shotPick')}
    </Button>
  );

  let body: ReactNode;
  if (sentAt !== null) {
    const when =
      dayLabel(sentAt).kind === 'today'
        ? t('p88money.shotWhenToday', { time: formatTime(sentAt, i18n.language) })
        : t('p88money.shotWhenDay', {
            day: formatDayMonth(sentAt),
            time: formatTime(sentAt, i18n.language),
          });
    body = (
      <>
        <FileRow
          name={sent?.file.name ?? t('p88money.shotFile')}
          size={sent ? sizeOf(sent.file.size) : null}
        >
          <StatusTag tone="ok">{t('p88money.shotSentChip')}</StatusTag>
        </FileRow>
        <p className="mt-2 text-[14px] text-fg-muted">{t('p88money.shotSent', { when })}</p>
      </>
    );
  } else if (step.kind === 'uploading') {
    const percent = Math.round(step.fraction * 100);
    body = (
      <>
        {lead}
        <FileRow name={step.file.name} size={sizeOf(step.file.size)} />
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('p88money.shotTitle')}
          className="mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-100"
        >
          <i
            className="block h-full rounded-full bg-primary"
            style={{ width: `${String(percent)}%` }}
          />
        </div>
        <p className="num mt-1.5 text-[14px] text-fg-muted">
          {t('p88money.shotUploading', { percent })}
        </p>
      </>
    );
  } else if (step.kind === 'big' || step.kind === 'type') {
    body = (
      <>
        {lead}
        <Banner tone="bad">
          {step.kind === 'big'
            ? t('p88money.shotBig', { size: step.size })
            : t('p88money.shotType')}
        </Banner>
        <div className="mt-2.5 flex flex-wrap gap-2">{another}</div>
      </>
    );
  } else if (step.kind === 'failed') {
    const file = step.file;
    body = (
      <>
        {lead}
        <FileRow name={file.name} size={sizeOf(file.size)} />
        <div className="mt-2.5">
          <Banner tone="bad">{step.message}</Banner>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              upload(file);
            }}
          >
            {t('p88money.shotRetry')}
          </Button>
          <Button tone="outline" size="sm" onClick={pick}>
            {t('p88money.shotPick')}
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {lead}
        <Button tone="outline" size="sm" onClick={pick}>
          <Icon name="image" />
          {t('p88money.shotAdd')}
        </Button>
      </>
    );
  }

  return (
    <Card>
      <h3 className="mb-1 text-[17px] font-semibold">{t('p88money.shotTitle')}</h3>
      {body}
      {mayAct && sentAt === null ? (
        <input
          ref={input}
          type="file"
          accept={EVIDENCE_CONTENT_TYPES.join(',')}
          aria-label={t('p88money.shotPickLabel')}
          className="hidden"
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      ) : null}
    </Card>
  );
}
