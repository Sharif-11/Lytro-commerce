import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useSmsLog } from '@/api/sms';
import { Card } from '@/components/ui/card';
import { SectionHead } from '@/components/ui/page';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { LogRow } from './index';

/**
 * The order's own SMS (Part 37's `p37-o-sms`, SMS-17): its rows from the log, newest first, with the way to the whole log.
 * Shown to those who may read SMS, once the order has sent one.
 */
export function OrderSmsCard({ orderId }: { orderId: string }): React.JSX.Element | null {
  const { t } = useTranslation('orders');
  const { slug, viewer } = useShell();
  const log = useSmsLog({ orderId, enabled: allows(viewer, [Permission.SmsRead]) });
  const rows = log.data?.pages.flatMap((page) => page.sms) ?? [];
  if (rows.length === 0) return null;
  return (
    <Card flush>
      <div className="px-4 pt-3.5 pb-1">
        <SectionHead
          link={
            <Link to="/$shop/settings/sms" params={{ shop: slug }} search={{ tab: 'log' }}>
              {t('p37TabLog')}
            </Link>
          }
        >
          {t('p37OrderSms')}
        </SectionHead>
      </div>
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
        {rows.map((row) => (
          <LogRow key={row.id} row={row} inOrder />
        ))}
      </div>
    </Card>
  );
}
