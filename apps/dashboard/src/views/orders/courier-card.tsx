import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { CourierNewsSource, ParcelAttention, ParcelReading } from '@lytronix/validators';
import { useParcelSeen, useSyncParcel } from '@/api/couriers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Kv } from '@/components/ui/kv';
import { RowLead } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { TimelineRow } from '@/components/ui/timeline';
import { courierName, dayInSentence } from '@/lib/couriers';
import { dayKey, formatDayMonth } from '@/lib/dates';
import { useShell } from '@/shell/shell-context';
import type { OrderParcel } from '@/types/couriers';
import type { Order } from '@/types/orders';
import { spanWords } from '@/views/listener/phone-health';
import { useOrderWords } from './order-words';
import { ATTENTION_WORD, newsWords, READING_LOOK, readingOf } from './parcel-words';

const SOURCE_WORD: Readonly<Record<CourierNewsSource, string>> = {
  [CourierNewsSource.Message]: 'crFromMsg',
  [CourierNewsSource.Check]: 'crFromCheck',
  [CourierNewsSource.Sync]: 'crFromSync',
};

/** When a piece of news came, as the sketch's news writes it: "today 10:30", "yesterday 11:04 pm", else the day. */
function useNewsWhen(): (iso: string) => string {
  const { t } = useTranslation('orders');
  const words = useOrderWords();
  return (iso) => {
    const day = dayKey(iso);
    if (day === dayKey(new Date().toISOString())) return `${t('lastToday')} ${words.time(iso)}`;
    if (day === dayKey(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())) {
      return `${t('lastYesterday')} ${words.time(iso)}`;
    }
    return formatDayMonth(iso);
  };
}

/** Its courier's own chip and status line (the card's first row, and the list's open order). */
function CourierHead({ parcel }: { parcel: OrderParcel }): React.JSX.Element {
  const { t } = useTranslation('orders');
  const name = courierName(parcel.courierKey);
  const look = READING_LOOK[readingOf(parcel)];
  return (
    <div className="flex items-center gap-3 pt-2.5 pb-1">
      <RowLead className="text-neutral-700">
        <Icon name="truck" />
      </RowLead>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">
          {name} <StatusTag tone={look.tone}>{t(look.word)}</StatusTag>
        </span>
        <span className="num text-[14px] text-fg-muted">
          {t('crCourierSays', { c: name, s: parcel.courierStatus ?? '–' })}
        </span>
      </span>
    </div>
  );
}

/** What staff should look at, in its own words, with the figures it names (read agreed 2026-11-05). */
function attentionText(
  order: Order,
  parcel: OrderParcel,
  attention: ParcelAttention,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const c = courierName(parcel.courierKey);
  switch (attention) {
    case ParcelAttention.CashDiffers:
      return t(ATTENTION_WORD[attention], {
        c,
        a: formatTaka(parcel.cashCollected ?? '0'),
        b: formatTaka(parcel.cod),
        d: formatTaka(order.due),
      });
    case ParcelAttention.CodChanged:
      return t(ATTENTION_WORD[attention], { c, a: formatTaka(parcel.codAtCourier ?? '0') });
    case ParcelAttention.DeliveredAfterCancel:
    case ParcelAttention.ReportAfterDelivered:
      return t(ATTENTION_WORD[attention], { c });
  }
}

/**
 * The order's Courier card (Part 36's `c36Card`), in place of Shipping once it is booked: the courier with what its status
 * means here and its own words; the tracking code with Track on the courier, the consignment ID, the COD sent, what it
 * collected and its charge; being paid; when Lytro last checked; its news, newest first, each with where it came from. Sync
 * in its header, and what staff should look at with Mark as seen, for whoever may manage orders.
 */
export function CourierCard({
  order,
  parcel,
  canManage,
}: {
  order: Order;
  parcel: OrderParcel;
  canManage: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('orders');
  const { t: menuWords } = useTranslation('menu');
  const { showToast } = useShell();
  const when = useNewsWhen();
  const sync = useSyncParcel(order.id);
  const seen = useParcelSeen(order.id);
  const name = courierName(parcel.courierKey);
  const reading = readingOf(parcel);
  const finished =
    reading === ParcelReading.Delivered ||
    reading === ParcelReading.PartlyDelivered ||
    reading === ParcelReading.Returning;
  // Sync asks where a parcel on its way stands; a finished or cancelled one has nothing more to ask (CRR-14).
  const canSync = canManage && parcel.settled && !finished && order.cancelledAt === null;
  // CRR-14: Lytro's own last word on it, a check or a Sync; the newest news is first.
  const checked = parcel.news.find((news) => news.source !== CourierNewsSource.Message) ?? null;
  const failure = sync.error ?? seen.error;

  const paid = parcel.paidAt
    ? parcel.payoutId
      ? t('crPaid', { c: name, d: dayInSentence(parcel.paidAt, i18n.language), p: parcel.payoutId })
      : t('crPaidNoId', { c: name, d: dayInSentence(parcel.paidAt, i18n.language) })
    : null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold">{t('crCard')}</h2>
        {canSync ? (
          <Button
            tone="outline"
            size="xs"
            busy={sync.isPending}
            onClick={() => {
              const before = parcel.news[0]?.at ?? null;
              sync.mutate(undefined, {
                onSuccess: (answer) => {
                  // Nothing newer came: inside 10 minutes of the last ask the server shows what it saved (CRR-14).
                  if ((answer.parcel?.news[0]?.at ?? null) === before) showToast(t('crSaved'));
                },
              });
            }}
          >
            <Icon name="refresh" />
            {t('crSync')}
          </Button>
        ) : null}
      </div>
      {failure ? (
        <div className="mt-2">
          <ErrorBanner error={failure} />
        </div>
      ) : null}
      {parcel.attention ? (
        <div className="mt-2">
          <Banner
            tone="warn"
            action={
              canManage ? (
                <button
                  type="button"
                  className="text-primary"
                  disabled={seen.isPending}
                  onClick={() => {
                    seen.mutate();
                  }}
                >
                  {t('crSeen')}
                </button>
              ) : undefined
            }
          >
            {attentionText(order, parcel, parcel.attention, t)}
          </Banner>
        </div>
      ) : null}
      <CourierHead parcel={parcel} />
      {parcel.trackingCode ? (
        <Kv
          label={t('tracking')}
          value={
            <>
              {parcel.trackingCode}
              {order.trackingLink ? (
                <>
                  {' · '}
                  <a
                    href={order.trackingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary no-underline"
                  >
                    {t('crTrackOn', { c: name })}
                  </a>
                </>
              ) : null}
            </>
          }
        />
      ) : null}
      {parcel.consignmentId ? <Kv label={t('crConsignment')} value={parcel.consignmentId} /> : null}
      <Kv label={t('crCodSent')} value={formatTaka(parcel.cod)} />
      {parcel.cashCollected !== null ? (
        <Kv label={t('crCollected')} value={formatTaka(parcel.cashCollected)} />
      ) : null}
      <Kv
        label={t('crCharge')}
        value={
          parcel.deliveryCharge === null ? (
            <span className="font-normal text-fg-muted">{t('crChargeNone')}</span>
          ) : (
            formatTaka(parcel.deliveryCharge)
          )
        }
      />
      {paid ? (
        <div className="mt-2 flex items-start gap-2.5 px-3 py-2 text-[14px] leading-[1.5]">
          <span className="mt-0.5">
            <Icon name="check" />
          </span>
          <span className="num flex-1">{paid}</span>
        </div>
      ) : reading === ParcelReading.Delivered || reading === ParcelReading.PartlyDelivered ? (
        <p className="mt-2 text-[14px] text-fg-muted">{t('crNotPaid', { c: name })}</p>
      ) : null}
      {parcel.noNews ? (
        <div className="mt-2">
          <Banner tone="neutral">{t('crNoNews', { c: name })}</Banner>
        </div>
      ) : checked ? (
        <p className="num mt-2 text-[14px] text-fg-muted">
          {t('crChecked', { t: spanWords(checked.at, menuWords) })}
        </p>
      ) : null}
      {parcel.news.length > 0 ? (
        <>
          <h3 className="mt-3.5 mb-1.5 text-[16px] font-semibold">{t('crNews')}</h3>
          <div>
            {parcel.news.map((news) => {
              const said = newsWords(news, i18n.language);
              return (
                <TimelineRow
                  key={`${news.at} ${news.source} ${news.rawStatus ?? ''}`}
                  dot={news.rawStatus === 'delivered' ? 'on' : 'plain'}
                  text={said ?? <span className="num">{news.rawStatus ?? ''}</span>}
                  sub={
                    <>
                      {t(SOURCE_WORD[news.source])}
                      {said && news.rawStatus ? (
                        <>
                          {' · '}
                          <span className="num">{news.rawStatus}</span>
                        </>
                      ) : null}
                    </>
                  }
                  when={when(news.at)}
                />
              );
            })}
          </div>
        </>
      ) : null}
    </Card>
  );
}

/** The Courier card before booking (Part 36's `c36NotBooked`): Book courier sends it to the default, or another chosen. */
export function NotBookedCard({ defaultName }: { defaultName: string }): React.JSX.Element {
  const { t } = useTranslation('orders');
  return (
    <Card>
      <h3 className="text-[16px] font-semibold">{t('crCard')}</h3>
      <p className="mt-1.5 text-[14px] text-fg-muted">{t('crNotBooked', { c: defaultName })}</p>
    </Card>
  );
}
