import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { IdentityKind, NotificationKind } from '@lytronix/validators';
import { errorMessage } from '@lytronix/api-client';
import { useMe } from '@/api/me';
import { useIdentities } from '@/api/identities';
import {
  useNotificationPreferences,
  usePushKey,
  useSaveNotificationPreferences,
  useTestPush,
} from '@/api/notifications';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { deviceName, usePushDevice } from '@/lib/push';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { NotificationGroup, NotificationSwitch } from '@/types/notifications';

/** Each kind's name, and a line under it where the sketch draws one (Part 37's `P37_KINDS`). */
const KIND_WORDS: Readonly<Record<NotificationKind, readonly [string, string?]>> = {
  [NotificationKind.OrderPlaced]: ['p37NkOrderPlaced', 'p37NkOrderPlacedD'],
  [NotificationKind.PaymentToVerify]: ['p37NkToVerify'],
  [NotificationKind.PaymentVerified]: ['p37NkVerified', 'p37NkVerifiedD'],
  [NotificationKind.MoneyForClosedOrder]: ['p37NkClosed'],
  [NotificationKind.GatewayAttention]: ['p37NkGateway'],
  [NotificationKind.PaymentMethodRetiring]: ['p37NkMethodRetire'],
  [NotificationKind.PaymentMethodBack]: ['p37NkMethodBack'],
  [NotificationKind.ListenerPhone]: ['p37NkListener'],
  [NotificationKind.ParcelAttention]: ['p37NkParcelLook'],
  [NotificationKind.ParcelMoved]: ['p37NkParcelMoved', 'p37NkParcelMovedD'],
  [NotificationKind.CourierConnection]: ['p37NkCourierConn'],
  [NotificationKind.CourierRetiring]: ['p37NkCourierRetire'],
  [NotificationKind.CourierBack]: ['p37NkCourierBack'],
  [NotificationKind.LowStock]: ['p37NkLowStock'],
  [NotificationKind.BatchExpiring]: ['p37NkExpiring'],
  [NotificationKind.HeldStockExpired]: ['p37NkHeldExpired'],
  [NotificationKind.MediaFailed]: ['p37NkMedia'],
  [NotificationKind.LowBalance]: ['p37NkLowBalance'],
  [NotificationKind.UsageWarning]: ['p37NkUsage'],
  [NotificationKind.RenewalReminder]: ['p37NkRenewal'],
  [NotificationKind.AccountNotice]: ['p37NkAccount'],
  [NotificationKind.EmailBounced]: ['p37NkBounced'],
  [NotificationKind.LytroNotice]: ['p37NkLytro'],
};

const GROUP_WORDS: Readonly<Record<NotificationGroup, string>> = {
  orders: 'p37GrOrders',
  payments: 'p37GrPayments',
  couriers: 'p37GrCouriers',
  stock: 'p37GrStock',
  media: 'p37GrMedia',
  account: 'p37GrAccount',
};
const GROUPS: readonly NotificationGroup[] = [
  'orders',
  'payments',
  'couriers',
  'stock',
  'media',
  'account',
];

/** "Always on" with a lock, for a money or account kind (D7-40). */
export function AlwaysOn(): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap text-neutral-700">
      <Icon name="lock" size={14} /> {t('p37Locked')}
    </span>
  );
}

/** Push on this device (Part 37's `p37-push-*`, NTF-02): turn on, on with a test and off, blocked, iPhone's Home Screen. */
function PushCard(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, showToast } = useShell();
  const key = usePushKey();
  const push = usePushDevice(key.isSuccess ? key.data : undefined);
  const test = useTestPush();
  const [busy, setBusy] = useState(false);
  const { browser, system } = deviceName(navigator.userAgent);
  const device = t('p37PushDeviceName', { b: browser, s: system });
  let inner: React.JSX.Element;
  if (push.state === 'on') {
    inner = (
      <>
        <p className="mt-1 mb-2.5 font-semibold text-success">{t('p37PushOnD', { d: device })}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            tone="outline"
            size="sm"
            busy={test.isPending}
            onClick={() => {
              test.mutate(undefined, {
                onSuccess: (result) => {
                  const sent = t('p37PushTested', { count: result.sent });
                  showToast(
                    result.gone ? `${sent} · ${t('p37PushGone', { count: result.gone })}` : sent,
                  );
                },
                onError: (error) => {
                  showToast(errorMessage(error, t));
                },
              });
            }}
          >
            {t('p37PushTest')}
          </Button>
          <Button
            tone="ghost"
            size="sm"
            busy={busy}
            onClick={() => {
              setBusy(true);
              void push.turnOff().finally(() => {
                setBusy(false);
              });
            }}
          >
            {t('p37PushStop')}
          </Button>
        </div>
      </>
    );
  } else if (push.state === 'ios') {
    inner = (
      <div className="mt-1">
        <Banner
          tone="info"
          action={
            <Link to="/$shop/menu" params={{ shop: slug }} className="text-primary">
              {t('p37PushHow')}
            </Link>
          }
        >
          {t('p37PushIos')}
        </Banner>
      </div>
    );
  } else if (push.state === 'unsupported' || push.state === 'unset') {
    inner = (
      <p className="mt-1 text-[14px] text-fg-muted">
        {push.state === 'unset' ? t('p37PushUnset') : t('p37PushUnsupported')}
      </p>
    );
  } else {
    const blocked = push.state === 'blocked';
    inner = (
      <>
        {blocked ? (
          <div className="mt-1 mb-2.5">
            <Banner tone="warn">{t('p37PushBlocked')}</Banner>
          </div>
        ) : (
          <p className="mt-1 mb-2.5 text-[14px] text-fg-muted">{t('p37PushOffD')}</p>
        )}
        <Button
          tone={blocked ? 'outline' : 'primary'}
          size="sm"
          busy={busy || push.state === 'loading'}
          onClick={() => {
            setBusy(true);
            void push
              .turnOn()
              .then((next) => {
                if (next === 'on') showToast(t('p37PushOnD', { d: device }));
              })
              .catch((error: unknown) => {
                showToast(errorMessage(error, t));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {blocked ? null : <Icon name="bell" size={18} />}
          {t('p37PushOn')}
        </Button>
      </>
    );
  }
  return (
    <Card>
      <h3 className="text-[16px] font-semibold">{t('p37PushT')}</h3>
      {inner}
    </Card>
  );
}

/**
 * Settings › Notifications (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-prefs`; NTF-02, NTF-04, D7-40, D7-41): the kinds
 * the person can hear, grouped, each a switch covering the bell and push on every device, money and account kinds locked
 * on; push on this device; for the owner, what email carries; and the language email and push come in.
 */
export function NotificationPrefsView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, viewer, showToast } = useShell();
  const me = useMe();
  const kinds = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const identities = useIdentities({ enabled: viewer.isOwner });
  const email =
    identities.data?.identities.find((each) => each.kind === IdentityKind.Email)?.value ?? null;
  const language = me.data?.language ?? 'bn';

  const flip = (changed: NotificationSwitch, on: boolean): void => {
    const off = (kinds.data ?? [])
      .filter((each) => !each.locked && (each.kind === changed.kind ? !on : !each.on))
      .map((each) => each.kind);
    save.mutate(off, {
      onSuccess: () => {
        showToast(t('p37PrefsSaved'));
      },
      onError: (error) => {
        showToast(errorMessage(error, t));
      },
    });
  };

  return (
    <ShellPage>
      <p className="text-[14px] text-fg-muted">{t('p37PrefsLead')}</p>
      {viewer.isOwner ? null : <Banner tone="neutral">{t('p37PrefsStaffD')}</Banner>}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start [&>*]:min-w-0">
        <div className="order-2 lg:order-1">
          <Card flush>
            {kinds.isLoading ? (
              <SkeletonRows count={6} />
            ) : (
              GROUPS.map((group) => {
                const rows = (kinds.data ?? []).filter((each) => each.group === group);
                if (rows.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-neutral-700">
                      {t(GROUP_WORDS[group])}
                    </div>
                    <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
                      {rows.map((row) => {
                        const [name, line] = KIND_WORDS[row.kind];
                        return (
                          <div
                            key={row.kind}
                            className="flex min-h-14 items-center gap-3 px-4 py-3"
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-[15px] leading-[1.4] font-medium">
                                {t(name)}
                              </span>
                              {line ? (
                                <span className="text-[13px] leading-[1.4] text-fg-muted">
                                  {t(line)}
                                </span>
                              ) : null}
                            </span>
                            {row.locked ? (
                              <AlwaysOn />
                            ) : (
                              <Switch
                                checked={row.on}
                                label={t(name)}
                                disabled={save.isPending}
                                onChange={(on) => {
                                  flip(row, on);
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            <p className="px-4 pt-2.5 pb-3.5 text-[14px] text-fg-muted">{t('p37PrefsOwn')}</p>
          </Card>
        </div>
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          <PushCard />
          {viewer.isOwner ? (
            <Card>
              <h3 className="text-[16px] font-semibold">{t('p37MailT')}</h3>
              <p className="mt-1 text-[14px] text-fg-muted">
                {email ? t('p37MailD', { e: email }) : t('p37MailNone')}
              </p>
            </Card>
          ) : null}
          <Card>
            <h3 className="text-[16px] font-semibold">{t('language')}</h3>
            <p className="mt-1 mb-2 text-[14px] text-fg-muted">
              {t('p37LangLine', { l: t(language === 'en' ? 'p37LangEn' : 'p37LangBn') })}
            </p>
            <Link
              to="/$shop/account"
              params={{ shop: slug }}
              className="text-[14px] font-semibold text-primary underline"
            >
              {t('secAccount', { ns: 'shell' })}
            </Link>
          </Card>
        </div>
      </div>
    </ShellPage>
  );
}
