import { NotificationKind } from '@lytronix/validators';
import { Icon, type IconName } from '@/components/icon';
import type { NotificationView } from '@/types/notifications';
import { useWhen } from './notification-words';

type Tone = 'info' | 'warn' | 'danger' | 'success' | 'mari';

// Each kind's square, as Part 37's bell draws it (`P37_NT`): what it is about, and how much it needs the person.
const LOOK: Readonly<Record<NotificationKind, { icon: IconName; tone: Tone }>> = {
  [NotificationKind.OrderPlaced]: { icon: 'orders', tone: 'info' },
  [NotificationKind.PaymentToVerify]: { icon: 'banknote', tone: 'warn' },
  [NotificationKind.PaymentVerified]: { icon: 'banknote', tone: 'success' },
  [NotificationKind.MoneyForClosedOrder]: { icon: 'banknote', tone: 'warn' },
  [NotificationKind.GatewayAttention]: { icon: 'alert', tone: 'danger' },
  [NotificationKind.ParcelAttention]: { icon: 'alert', tone: 'warn' },
  [NotificationKind.ParcelMoved]: { icon: 'truck', tone: 'info' },
  [NotificationKind.CourierConnection]: { icon: 'truck', tone: 'danger' },
  [NotificationKind.CourierRetiring]: { icon: 'truck', tone: 'warn' },
  [NotificationKind.CourierBack]: { icon: 'truck', tone: 'success' },
  [NotificationKind.LowStock]: { icon: 'box', tone: 'danger' },
  [NotificationKind.BatchExpiring]: { icon: 'calendar', tone: 'warn' },
  [NotificationKind.HeldStockExpired]: { icon: 'box', tone: 'warn' },
  [NotificationKind.MediaFailed]: { icon: 'image', tone: 'danger' },
  [NotificationKind.ListenerPhone]: { icon: 'smartphone', tone: 'warn' },
  [NotificationKind.LowBalance]: { icon: 'money', tone: 'warn' },
  [NotificationKind.UsageWarning]: { icon: 'trend', tone: 'warn' },
  [NotificationKind.RenewalReminder]: { icon: 'calendar', tone: 'info' },
  [NotificationKind.AccountNotice]: { icon: 'info', tone: 'info' },
  [NotificationKind.EmailBounced]: { icon: 'alert', tone: 'danger' },
  [NotificationKind.LytroNotice]: { icon: 'megaphone', tone: 'mari' },
};

const TONES: Record<Tone, string> = {
  info: 'bg-info-soft text-info-text',
  warn: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger-text',
  success: 'bg-success-soft text-success',
  mari: 'bg-accent-soft text-accent-text',
};

/** One notification (the prototype's `.nrow`): its square, its two lines in the server's words, and when. */
export function NotificationRow({
  notification,
  onOpen,
}: {
  notification: NotificationView;
  onOpen: (notification: NotificationView) => void;
}): React.JSX.Element {
  const when = useWhen();
  const look = LOOK[notification.kind];
  const unread = !notification.read;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(notification);
      }}
      className={[
        'relative flex w-full items-start gap-3 py-2.5 pr-3.5 pl-4 text-left hover:bg-neutral-50',
        unread
          ? 'bg-primary-soft before:absolute before:top-1/2 before:left-1.5 before:size-1.5 before:-translate-y-1/2 before:rounded-full before:bg-accent'
          : '',
      ].join(' ')}
    >
      <span
        className={`flex size-[38px] flex-none items-center justify-center rounded-[10px] ${TONES[look.tone]}`}
      >
        <Icon name={look.icon} size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[14px] leading-[1.4] ${unread ? 'font-bold' : 'font-semibold'}`}>
          {notification.title}
        </span>
        <span className="text-[13px] leading-[1.4] text-neutral-700">{notification.body}</span>
      </span>
      <span className="num pt-0.5 text-[12px] whitespace-nowrap text-neutral-700">
        {when(notification.createdAt)}
      </span>
    </button>
  );
}
