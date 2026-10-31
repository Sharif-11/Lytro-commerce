import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { PaymentMethod } from '@lytronix/validators';
import { useRecordPayment, useVoidPayment } from '@/api/orders';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderPayment } from '@/types/orders';
import { useOrderWords } from './order-words';

/** How a payment by hand came (ORD-15), in the order Part 29's `o29-pay` lists them; cash on delivery is never typed. */
const METHODS: readonly PaymentMethod[] = [
  PaymentMethod.Cash,
  PaymentMethod.Bkash,
  PaymentMethod.Nagad,
  PaymentMethod.Rocket,
  PaymentMethod.Upay,
  PaymentMethod.Bank,
];

const WALLETS: readonly PaymentMethod[] = [
  PaymentMethod.Bkash,
  PaymentMethod.Nagad,
  PaymentMethod.Rocket,
  PaymentMethod.Upay,
];

/** A Bangladeshi mobile typed after +880 ("1819 876 543"), as the server takes it; null until it is ten digits. */
function mobileOf(typed: string): string | null {
  const digits = typed.replace(/\D/g, '').replace(/^0/, '');
  return /^1[3-9]\d{8}$/.test(digits) ? `+880${digits}` : null;
}

/**
 * Record a payment (Part 29's `o29-pay`, ORD-15, ORD-22): how it came, the amount -- no more than is due -- and for a
 * wallet the number it was sent from and its TrxID, for a bank its reference. Verified at once (D4-6).
 */
export function RecordPaymentSheet({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const words = useOrderWords();
  const { showToast } = useShell();
  const record = useRecordPayment(order.id);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [amount, setAmount] = useState('');
  const [sender, setSender] = useState('');
  const [reference, setReference] = useState('');
  const due = Number(order.due);
  const value = Number(amount);
  const wallet = method !== null && WALLETS.includes(method);
  const ready =
    method !== null &&
    value > 0 &&
    value <= due &&
    (!wallet || (mobileOf(sender) !== null && reference.trim() !== '')) &&
    (method !== PaymentMethod.Bank || reference.trim() !== '');
  return (
    <Sheet
      open
      title={t('recordTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={record.isPending}
          disabled={!ready}
          onClick={() => {
            if (method === null) return;
            const number = wallet ? mobileOf(sender) : null;
            record.mutate(
              {
                method,
                amount: value.toFixed(2),
                ...(number ? { senderNumber: number } : {}),
                ...(method !== PaymentMethod.Cash && reference.trim()
                  ? { transactionId: reference.trim() }
                  : {}),
              },
              {
                onSuccess: () => {
                  showToast(
                    t('paidToast', { amount: formatTaka(value), method: words.method(method) }),
                  );
                  onClose();
                },
              },
            );
          }}
        >
          {t('save')}
        </Button>
      }
    >
      {record.isError ? <Banner tone="bad">{errorText(record.error)}</Banner> : null}
      <div>
        <h3 className="mb-2 text-[16px] font-semibold">{t('payMethod')}</h3>
        <div role="group" aria-label={t('payMethod')} className="flex flex-wrap gap-2">
          {METHODS.map((each) => (
            <Chip
              key={each}
              on={method === each}
              onClick={() => {
                setMethod(each);
              }}
            >
              {words.method(each)}
            </Chip>
          ))}
        </div>
      </div>
      <Field
        label={t('payAmount')}
        prefix="৳"
        inputMode="decimal"
        value={amount}
        help={t('payHelp', { amount: formatTaka(due) })}
        onChange={(event) => {
          setAmount(event.target.value.replace(/[^\d.]/g, ''));
        }}
      />
      {wallet ? (
        <>
          <Field
            label={t('paySender')}
            prefix="+880"
            inputMode="tel"
            value={sender}
            onChange={(event) => {
              setSender(event.target.value);
            }}
          />
          <Field
            label={t('payTrxId')}
            value={reference}
            onChange={(event) => {
              setReference(event.target.value);
            }}
          />
        </>
      ) : method === PaymentMethod.Bank ? (
        <Field
          label={t('payReference')}
          value={reference}
          onChange={(event) => {
            setReference(event.target.value);
          }}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * Void this payment? (Part 29's `o29-void`, agreed 2026-10-30): a payment recorded by mistake, with why; it stays on the
 * order struck through and stops counting.
 */
export function VoidSheet({
  order,
  payment,
  onClose,
}: {
  order: Order;
  payment: OrderPayment;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const remove = useVoidPayment(order.id);
  const [reason, setReason] = useState('');
  return (
    <Sheet
      open
      title={t('voidTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            tone="danger"
            busy={remove.isPending}
            disabled={reason.trim() === ''}
            onClick={() => {
              remove.mutate(
                { paymentId: payment.id, reason: reason.trim() },
                { onSuccess: onClose },
              );
            }}
          >
            {t('voidIt')}
          </Button>
        </>
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">{t('voidHelp')}</p>
      {remove.isError ? <Banner tone="bad">{errorText(remove.error)}</Banner> : null}
      <Field
        label={t('voidReason')}
        value={reason}
        maxLength={500}
        onChange={(event) => {
          setReason(event.target.value);
        }}
      />
    </Sheet>
  );
}
