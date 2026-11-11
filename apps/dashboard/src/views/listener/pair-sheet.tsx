import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListenerDeviceStatus } from '@lytronix/validators';
import { useListenerPhones, useMakePairingCode, usePhonePaired } from '@/api/listener';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { buttonClass } from '@/components/ui/classes';
import { QrCode } from '@/components/ui/qr-code';
import { Sheet } from '@/components/ui/sheet';
import { appConfig } from '@/lib/app-config';
import type { PairingCode } from '@/types/payments';

// While the sheet is open it looks for the new phone this often, so pairing shows here by itself.
const WAITING_POLL_MS = 5_000;
const SECOND_MS = 1_000;
const MINUTE_SECONDS = 60;

/** `K7MP4X2H` as it's easiest to read out: `K7MP 4X2H`. */
const spaced = (code: string): string => code.replace(/(.{4})(?=.)/g, '$1 ');

/** What's left, `9:42`. */
function left(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / SECOND_MS));
  return `${String(Math.floor(seconds / MINUTE_SECONDS))}:${String(seconds % MINUTE_SECONDS).padStart(2, '0')}`;
}

/** The app reads this link from the QR, or opens to it from a tap on the same phone (LISTENER-APP-DESIGN §7). */
const pairLink = (code: string): string => `lytro-listener://pair?code=${code}`;

/**
 * Pair a phone (the prototype's `sh-lp35-pair`, LSN-01, LSN-09): a single-use code as a QR and as text, open 10 minutes. It makes a
 * code on opening, and watches for the phone that uses it.
 */
export function PairSheet({
  known,
  onClose,
}: {
  /** The phones here when it opens, so a new one can be told apart. */
  known: readonly string[];
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const make = useMakePairingCode();
  const paired = usePhonePaired();
  const [code, setCode] = useState<PairingCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(false);
  // As they were on opening: the list this sheet reads again goes on to hold the new phone.
  const [before] = useState(known);

  const makeCode = (): void => {
    make.mutate(undefined, {
      onSuccess: (made) => {
        setCode(made);
        setNow(Date.now());
      },
    });
  };
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    makeCode();
    // Once, on opening: a code is made only when someone asks to pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, SECOND_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const phones = useListenerPhones({ pollMs: WAITING_POLL_MS });
  const arrived = phones.data?.devices.find(
    (phone) => phone.status === ListenerDeviceStatus.Active && !before.includes(phone.id),
  );
  const told = useRef(false);
  useEffect(() => {
    if (arrived && !told.current) {
      told.current = true;
      paired();
    }
  }, [arrived, paired]);

  if (arrived) {
    return (
      <Sheet
        open
        title={t('lpPairedTitle')}
        onClose={onClose}
        footer={
          <Button wide onClick={onClose}>
            {t('lpDone')}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-2.5 py-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-button bg-success-soft text-success">
            <Icon name="check" />
          </span>
          <p className="m-0 text-[16px]">{t('lpPairedText', { name: arrived.name })}</p>
        </div>
      </Sheet>
    );
  }

  const remaining = code ? new Date(code.expiresAt).getTime() - now : 0;
  const expired = code !== null && remaining <= 0;
  return (
    <Sheet
      open
      title={t('lpPair')}
      onClose={onClose}
      footer={
        expired ? (
          <Button wide busy={make.isPending} onClick={makeCode}>
            {t('lpNewCode')}
          </Button>
        ) : undefined
      }
    >
      {make.isError ? <ErrorBanner error={make.error} /> : null}
      {code ? (
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div
            className={[
              'overflow-hidden rounded-[12px] border border-line bg-white p-1.5',
              expired ? 'opacity-20' : '',
            ].join(' ')}
          >
            <QrCode text={pairLink(code.code)} label={t('lpQrLabel')} />
          </div>
          <div
            className={[
              'num text-[24px] font-semibold tracking-[.14em]',
              expired ? 'line-through opacity-35' : '',
            ].join(' ')}
          >
            {spaced(code.code)}
          </div>
          {expired ? null : (
            <p className="num m-0 text-[14px] text-fg-muted">
              {t('lpOpenFor', { left: left(remaining) })}
            </p>
          )}
        </div>
      ) : null}
      {expired ? <Banner tone="warn">{t('lpExpired')}</Banner> : null}
      {code && !expired ? (
        <>
          <ol className="m-0 flex list-decimal flex-col gap-1.5 ps-5 text-[15px]">
            <li>{t('lpPairS1')}</li>
            <li>{t('lpPairS2')}</li>
          </ol>
          <a
            href={pairLink(code.code)}
            className={`${buttonClass('outline', 'md', true)} lg:hidden`}
          >
            {t('lpInApp')}
          </a>
          <p className="m-0 flex items-center gap-2 text-[14px] text-fg-muted">
            <Icon name="clock" /> {t('lpWaiting')}
          </p>
          <a
            href={appConfig.listenerAppUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-primary underline"
          >
            {t('lpNoApp')} <Icon name="external" />
          </a>
        </>
      ) : null}
    </Sheet>
  );
}
