import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { formatTaka } from '@lytronix/ui';
import { ListenerMessageStatus } from '@lytronix/validators';
import { Banner } from '@/components/ui/banner';
import { buttonClass } from '@/components/ui/classes';
import { Kv } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { formatDayMonth, formatTime } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import type { PhoneReceipt, ShopPayment } from '@/types/payments';
import { useOrderWords } from '@/views/orders/order-words';
import { levelWord, receiptStatusOf, rejectWord, sourceWord } from './words';

function useMoment(): (iso: string) => string {
  const { i18n } = useTranslation();
  return (iso) => `${formatDayMonth(iso)}, ${formatTime(iso, i18n.language)}`;
}

/** A payment's details (the prototype's `sh-pay35-detail`, VER-12): how it came, how it was verified, by whom and when. */
export function PaymentDetailSheet({
  payment,
  onClose,
}: {
  payment: ShopPayment;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const words = useOrderWords();
  const moment = useMoment();
  const { slug } = useShell();
  return (
    <Sheet
      open
      title={t('spDetailTitle')}
      onClose={onClose}
      footer={
        <Link
          to="/$shop/orders/$orderId"
          params={{ shop: slug, orderId: payment.order.id }}
          className={buttonClass('outline', 'md', true)}
        >
          {t('spOpenOrder')}
        </Link>
      }
    >
      {payment.test ? <Banner tone="neutral">{t('spTestNote')}</Banner> : null}
      <div>
        <Kv label={t('spAmount')} value={formatTaka(payment.amount)} />
        <Kv label={t('spWallet')} value={words.method(payment.method)} />
        {payment.transactionId ? <Kv label="TrxID" value={payment.transactionId} /> : null}
        {payment.senderNumber ? (
          <Kv label={t('spSender')} value={bangladeshiPhone.grouped(payment.senderNumber)} />
        ) : null}
        <Kv label={t('spOrder')} value={`#${payment.order.orderNumber}`} />
        <Kv label={t('spFromWhere')} value={sourceWord(payment.source, t)} />
        {payment.verificationLevel ? (
          <Kv label={t('spHow')} value={levelWord(payment.verificationLevel, t)} />
        ) : null}
        {payment.rejectReason ? (
          <Kv label={t('spWhyRejected')} value={rejectWord(payment.rejectReason, t)} />
        ) : null}
        {payment.note ? <Kv label={t('spNote')} value={payment.note} /> : null}
        {payment.decidedAt ? (
          <>
            <Kv label={t('spWho')} value={payment.decidedBy?.name ?? t('spSystem')} />
            <Kv label={t('spWhen')} value={moment(payment.decidedAt)} />
          </>
        ) : (
          <Kv label={t('spWhen')} value={moment(payment.at)} />
        )}
      </div>
    </Sheet>
  );
}

/** A phone's receipt (the prototype's `sh-pay35-receipt`): what it read, the SMS itself until it is removed (LSN-17). */
export function ReceiptSheet({
  receipt,
  phoneName,
  onClose,
}: {
  receipt: PhoneReceipt;
  /** The phone that read it, for someone who may see the phones. */
  phoneName: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const moment = useMoment();
  return (
    <Sheet open title={t('spRTitle')} onClose={onClose}>
      {receipt.status === ListenerMessageStatus.Unmatched ? (
        <Banner tone="neutral">{t('spRWaits')}</Banner>
      ) : null}
      <div>
        {receipt.amount ? <Kv label={t('spAmount')} value={formatTaka(receipt.amount)} /> : null}
        {receipt.transactionId ? <Kv label="TrxID" value={receipt.transactionId} /> : null}
        {receipt.senderNumber ? (
          <Kv label={t('spSender')} value={bangladeshiPhone.grouped(receipt.senderNumber)} />
        ) : null}
        <Kv label={t('spRStatus')} value={receiptStatusOf(receipt.status, t).word} />
        {receipt.orderNumber ? <Kv label={t('spOrder')} value={`#${receipt.orderNumber}`} /> : null}
        <Kv label={t('spRGot')} value={moment(receipt.receivedAt)} />
        {phoneName ? <Kv label={t('spRPhone')} value={phoneName} /> : null}
      </div>
      {receipt.text ? (
        <p className="m-0 rounded-[8px] bg-neutral-50 px-3 py-2.5 text-[14px] leading-normal">
          {receipt.text}
        </p>
      ) : null}
      <p className="m-0 text-[14px] text-fg-muted">{t('spRGone')}</p>
    </Sheet>
  );
}
