import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  LISTENER_UNREAD_ALERT_PER_DAY,
  ListenerDeviceStatus,
  ListenerMessageStatus,
  PaymentPageReportStatus,
} from '@lytronix/validators';
import { usePageReports } from '@/api/page-reports';
import { useLytroPhones, useReceiptCount, useUnreadShapes } from '@/api/phones';
import { figureBox } from '@/components/ui/figure-box';
import { FigureBody, Figures } from '@/components/ui/figures';
import { dhakaDay, useAgo } from '@/lib/format';

const LOADING = <span className="skel h-6! w-[60px]" />;

/** What else needs a person (§3), each opening its screen; marigold on the first two when something is wrong. */
export function AlsoWaiting(): React.JSX.Element {
  const { t } = useTranslation();
  const ago = useAgo();
  const reports = usePageReports(PaymentPageReportStatus.Open);
  const phones = useLytroPhones();
  const unclaimed = useReceiptCount(ListenerMessageStatus.Unmatched);
  const unread = useUnreadShapes(1);

  const newest = reports.data?.reports[0];
  const openCount = reports.data?.reports.length;
  const working = phones.data?.devices.filter(
    (device) => device.status === ListenerDeviceStatus.Active,
  );
  const offline = working?.find((device) => !device.online);
  const today = dhakaDay(new Date());
  const unreadToday = unread.data
    ?.filter((shape) => shape.day === today)
    .reduce((sum, shape) => sum + shape.count, 0);

  return (
    <Figures>
      <Link to="/page-reports" className={figureBox((openCount ?? 0) > 0)}>
        <FigureBody
          label={t('today.reports')}
          value={openCount ?? LOADING}
          flagged={(openCount ?? 0) > 0}
          detail={
            newest
              ? t('today.reportsDetail', { r: t(`reportReasons.${newest.reason}`) })
              : t('figures.nothing')
          }
        />
      </Link>
      <Link to="/phones" className={figureBox(Boolean(offline))}>
        <FigureBody
          label={t('today.phones')}
          value={
            working
              ? t('phones.of', {
                  a: working.filter((device) => device.online).length,
                  b: working.length,
                })
              : LOADING
          }
          flagged={Boolean(offline)}
          detail={
            offline
              ? t('today.phonesDetail', {
                  name: offline.name,
                  ago: offline.lastSeenAt ? ago(offline.lastSeenAt) : '—',
                })
              : t('today.phonesOk')
          }
        />
      </Link>
      <Link to="/phones/receipts" className={figureBox(false)}>
        <FigureBody
          label={t('today.unclaimed')}
          value={unclaimed.data ?? LOADING}
          detail={unclaimed.data ? t('today.unclaimedDetail') : t('figures.nothing')}
        />
      </Link>
      <Link to="/phones/unread" className={figureBox(false)}>
        <FigureBody
          label={t('today.unread')}
          value={unreadToday ?? LOADING}
          detail={t('today.unreadDetail', { n: LISTENER_UNREAD_ALERT_PER_DAY })}
        />
      </Link>
    </Figures>
  );
}
