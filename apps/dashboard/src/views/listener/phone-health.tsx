import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ListenerDeviceStatus, Permission } from '@lytronix/validators';
import { Banner } from '@/components/ui/banner';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { ListenerPhone, ListenerPhones } from '@/types/payments';

const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_HOURS = 24;
// Past this, hours read better as days: "3 days", not "72 hours".
const HOURS_BEFORE_DAYS = 48;

/** When a phone last showed itself: its last report, or its pairing before the first one. */
export const lastSeenOf = (phone: ListenerPhone): string => phone.lastSeenAt ?? phone.pairedAt;

/** A span of time in words, for "seen 2 hours ago". */
export function spanWords(
  sinceIso: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  now = Date.now(),
): string {
  const minutes = Math.max(1, Math.round((now - new Date(sinceIso).getTime()) / MINUTE_MS));
  if (minutes < HOUR_MINUTES) return t('lpMinutes', { count: minutes });
  const hours = Math.round(minutes / HOUR_MINUTES);
  if (hours < HOURS_BEFORE_DAYS) return t('lpHours', { count: hours });
  return t('lpDays', { count: Math.round(hours / DAY_HOURS) });
}

export type PhoneHealth =
  { kind: 'none' } | { kind: 'online'; minutes: number } | { kind: 'offline'; since: string };

/** How the shop's phones stand (LSN-03, VER-07): any online is enough, and the most recent one is what's reported. */
export function phoneHealth(view: ListenerPhones, now = Date.now()): PhoneHealth {
  const active = view.devices.filter((phone) => phone.status === ListenerDeviceStatus.Active);
  if (active.length === 0) return { kind: 'none' };
  const newest = active
    .map(lastSeenOf)
    .reduce((latest, each) => (new Date(each) > new Date(latest) ? each : latest));
  return active.some((phone) => phone.online)
    ? {
        kind: 'online',
        minutes: Math.max(1, Math.round((now - new Date(newest).getTime()) / MINUTE_MS)),
      }
    : { kind: 'offline', since: newest };
}

/** Payments' line about the phones (the prototype's `pay35Health`, VER-07): working, gone quiet, or none paired. */
export function PhoneHealthBanner({ view }: { view: ListenerPhones }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, viewer } = useShell();
  const health = phoneHealth(view);
  const link = (label: string): React.JSX.Element => (
    <Link
      to="/$shop/settings/listener"
      params={{ shop: slug }}
      className="font-semibold whitespace-nowrap text-primary underline"
    >
      {label}
    </Link>
  );
  if (health.kind === 'online') {
    return (
      <Banner tone="neutral" icon="smartphone" dense>
        {t('lpPhoneSeen', { count: health.minutes })}
      </Banner>
    );
  }
  if (health.kind === 'offline') {
    return (
      <Banner tone="warn" action={link(t('lpSeePhones'))}>
        {t('lpPhoneOff', { span: spanWords(health.since, t) })}
      </Banner>
    );
  }
  return (
    <Banner
      tone="neutral"
      action={allows(viewer, [Permission.ListenerManage]) ? link(t('lpPair')) : undefined}
    >
      {t('lpNoPhone')}
    </Banner>
  );
}
