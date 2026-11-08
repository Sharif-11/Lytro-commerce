import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTakaExact } from '@lytronix/ui';
import {
  ADDRESS_TEXT_MAX_LENGTH,
  AddressFieldState,
  Permission,
  PerUsePaidFrom,
  type AddressRead,
} from '@lytronix/validators';
import { useReadAddress } from '@/api/fraud';
import { useUsage } from '@/api/usage';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { readsOf } from '@/views/usage/per-use';
import { filledOf } from './read-words';

/** How a read went, for the card's banner (Part 37's `p37ReadCard` states). */
type Outcome =
  | { kind: 'done'; read: AddressRead }
  | { kind: 'none' }
  | { kind: 'image' }
  | { kind: 'empty' }
  | { kind: 'long' }
  | { kind: 'minute' }
  | { kind: 'unavailable' }
  | { kind: 'nobal' }
  | { kind: 'said'; text: string };

/** "Check this" or "Not in the message" after a field's label (Part 37's `.p37mark`). */
export function ReadMark({
  state,
}: {
  state: AddressFieldState | undefined;
}): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  if (state === AddressFieldState.Check) {
    return (
      <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-warning-soft px-[7px] align-[1px] text-[11px] font-semibold text-warning">
        {t('p37RdCheck')}
      </span>
    );
  }
  if (state === AddressFieldState.Missing) {
    return (
      <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-neutral-100 px-[7px] align-[1px] text-[11px] font-semibold text-neutral-700">
        {t('p37RdMissing')}
      </span>
    );
  }
  return null;
}

/**
 * New order's first card (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-read*`; ORD-30 to ORD-34, D7-32 to D7-37): the
 * customer's message pasted as text, read for the delivery details, which fill the form below; what a read costs, from the
 * pack or the balance; nothing found costs nothing. Only text is read: a picture is refused here, before anything is sent.
 */
export function ReadMessageCard({
  onRead,
}: {
  onRead: (read: AddressRead) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { slug, viewer } = useShell();
  const errorText = useErrorText();
  const may = allows(viewer, [Permission.OrdersManage]);
  const usage = useUsage({ enabled: may && allows(viewer, [Permission.PaymentsRead]) });
  const read = useReadAddress();
  const [text, setText] = useState('');
  const [picture, setPicture] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  if (!may) return null;

  const reads = readsOf(usage.data);
  const rate = reads ? formatTakaExact(reads.rate) : null;
  const left =
    outcome?.kind === 'done' && outcome.read.charged?.allowanceLeft != null
      ? outcome.read.charged.allowanceLeft
      : (reads?.allowance?.left ?? 0);
  const length = Array.from(text).length;
  const bad = outcome?.kind === 'empty' || outcome?.kind === 'long' || outcome?.kind === 'image';

  const submit = (): void => {
    if (picture !== null) {
      setOutcome({ kind: 'image' });
      return;
    }
    const typed = text.trim();
    if (!typed) {
      setOutcome({ kind: 'empty' });
      return;
    }
    if (Array.from(typed).length > ADDRESS_TEXT_MAX_LENGTH) {
      setOutcome({ kind: 'long' });
      return;
    }
    setOutcome(null);
    read.mutate(typed, {
      onSuccess: (found) => {
        if (found.charged === null || filledOf(found) === 0) {
          setOutcome({ kind: 'none' });
          return;
        }
        setOutcome({ kind: 'done', read: found });
        onRead(found);
      },
      onError: (error) => {
        if (!(error instanceof ApiClientError)) {
          setOutcome({ kind: 'unavailable' });
        } else if (error.code === 'rate_limited') {
          setOutcome({ kind: 'minute' });
        } else if (error.code === 'service_unavailable') {
          setOutcome({ kind: 'unavailable' });
        } else if (error.code === 'quota_exceeded') {
          setOutcome({ kind: 'nobal' });
        } else {
          setOutcome({ kind: 'said', text: errorText(error) });
        }
      },
    });
  };

  const clear = (): void => {
    setText('');
    setPicture(null);
    setOutcome(null);
  };

  let result: React.JSX.Element | null = null;
  if (outcome?.kind === 'done') {
    const charged = outcome.read.charged;
    const paid =
      charged?.paidFrom === PerUsePaidFrom.Allowance
        ? t('p37RdAllowance', { n: charged.allowanceLeft ?? 0 })
        : t('p37RdCharged', { a: formatTakaExact(charged?.amount ?? 0) });
    result = (
      <Banner tone="info">
        {t('p37RdDone', { f: filledOf(outcome.read) })} · {paid}
      </Banner>
    );
  } else if (outcome?.kind === 'none') {
    result = <Banner tone="neutral">{t('p37RdNone')}</Banner>;
  } else if (outcome?.kind === 'image') {
    result = <Banner tone="bad">{t('p37RdImage')}</Banner>;
  } else if (outcome?.kind === 'minute') {
    result = <Banner tone="warn">{t('p37RdMinute')}</Banner>;
  } else if (outcome?.kind === 'unavailable') {
    result = <Banner tone="warn">{t('p37RdUnavailable')}</Banner>;
  } else if (outcome?.kind === 'said') {
    result = <Banner tone="bad">{outcome.text}</Banner>;
  } else if (outcome?.kind === 'nobal') {
    result = (
      <Banner
        tone="bad"
        action={
          <Link to="/$shop/balance" params={{ shop: slug }} className="text-primary">
            {t('p37TopUp')}
          </Link>
        }
      >
        {t('p37RdNoBal', { r: rate ?? '' })}
      </Banner>
    );
  }

  const quiet = text === '' && picture === null;
  const fresh = outcome === null || outcome.kind === 'empty';
  return (
    <Card className="flex flex-col gap-2.5">
      <h3 className="text-[17px] font-semibold">{t('p37RdT')}</h3>
      <p className="text-[14px] text-fg-muted">{t('p37RdLead')}</p>
      <div className="flex flex-col gap-1.5">
        {picture !== null ? (
          <div className="flex min-h-[104px] items-start gap-2 rounded-control border border-danger bg-surface p-3 text-[16px] text-fg-subtle">
            <Icon name="image" /> {picture}
          </div>
        ) : (
          <textarea
            aria-label={t('p37RdT')}
            dir="auto"
            value={text}
            placeholder={t('p37RdPh')}
            aria-invalid={bad ? true : undefined}
            onChange={(event) => {
              setText(event.target.value);
              if (outcome?.kind !== 'done') setOutcome(null);
            }}
            onPaste={(event) => {
              const file = Array.from(event.clipboardData.files).find((each) =>
                each.type.startsWith('image/'),
              );
              if (file && !event.clipboardData.getData('text')) {
                event.preventDefault();
                setPicture(file.name || 'image');
                setOutcome({ kind: 'image' });
              }
            }}
            className={[
              'min-h-[104px] resize-none rounded-control [field-sizing:content] border bg-surface p-3 text-[15px] leading-[1.55] outline-none [overflow-wrap:anywhere] placeholder:text-fg-subtle focus:outline-2 focus:outline-offset-1 focus:outline-focus',
              bad ? 'border-danger' : 'border-line-strong',
            ].join(' ')}
          />
        )}
        {outcome?.kind === 'long' || length > ADDRESS_TEXT_MAX_LENGTH ? (
          <div className="flex justify-between gap-2 text-[13px]">
            <span className="font-medium text-danger">{t('p37RdLong')}</span>
            <span className="num text-danger">
              {length.toLocaleString('en-US')} / {ADDRESS_TEXT_MAX_LENGTH.toLocaleString('en-US')}
            </span>
          </div>
        ) : outcome?.kind === 'empty' ? (
          <p className="text-[13px] font-medium text-danger">{t('p37RdEmpty')}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          tone={fresh ? 'primary' : 'outline'}
          size="sm"
          busy={read.isPending}
          onClick={submit}
        >
          <Icon name="sms" size={18} /> {t('p37RdBtn')}
        </Button>
        {quiet ? null : (
          <Button tone="ghost" size="sm" onClick={clear}>
            {t('p37RdClear')}
          </Button>
        )}
        {outcome?.kind === 'nobal' ? (
          <Link to="/$shop/addons" params={{ shop: slug }} className={buttonClass('outline', 'sm')}>
            {t('p37RdBuy')}
          </Link>
        ) : null}
      </div>
      {result}
      {rate !== null ? (
        <p className="text-[13px] text-fg-muted">
          {reads?.allowance && left > 0
            ? t('p37RdCostLeft', { count: left, r: rate })
            : t('p37RdCost', { r: rate })}
        </p>
      ) : null}
    </Card>
  );
}
