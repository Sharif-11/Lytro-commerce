import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { formatTaka } from '@lytronix/ui';
import { ApiClientError } from '@lytronix/api-client';
import { PaymentMethod, Permission, SmsEvent } from '@lytronix/validators';
import {
  useMakePaymentLink,
  useRecordPayment,
  useRefundPayment,
  useVoidPayment,
} from '@/api/orders';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { buttonClass } from '@/components/ui/classes';
import { CopyButton } from '@/components/ui/copy-button';
import { Field } from '@/components/ui/field';
import { Kv, RadioMark } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { bangladeshiPhone } from '@/lib/phone';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { Order, OrderPayment } from '@/types/orders';
import { useOrderWords } from './order-words';
import { SmsLine } from '@/views/sms/sms-line';

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
      {/* Part 37's `p37-o-pay` (D7-20). */}
      <SmsLine event={SmsEvent.PaymentVerified} words="p37LinePay" />
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

const REFUND_NOTE_MAX_LENGTH = 500;

/**
 * Refund (the prototype's `sh-o35-refund`, PAY-20, ORD-44): a record of money given back, which says plainly that Lytro sends
 * none. The payment stops counting, so what it paid goes back on the order's due.
 */
export function RefundSheet({
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
  const refund = useRefundPayment(order.id);
  const [note, setNote] = useState('');
  return (
    <Sheet
      open
      title={t('refundTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('refundKeep')}
          </Button>
          <Button
            tone="danger"
            busy={refund.isPending}
            disabled={note.trim().length === 0}
            onClick={() => {
              refund.mutate({ paymentId: payment.id, note: note.trim() }, { onSuccess: onClose });
            }}
          >
            {t('refundGo')}
          </Button>
        </>
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">
        {t('refundText', { amount: formatTaka(payment.amount) })}
      </p>
      {refund.isError ? <Banner tone="bad">{errorText(refund.error)}</Banner> : null}
      <Field
        label={t('refundNote')}
        placeholder={t('refundPlaceholder')}
        value={note}
        maxLength={REFUND_NOTE_MAX_LENGTH}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
    </Sheet>
  );
}

/** One choice of amount for the link, its figure on the right. */
function LinkChoice({
  on,
  label,
  amount,
  onChoose,
}: {
  on: boolean;
  label: string;
  amount: string;
  onChoose: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className="flex min-h-11 w-full items-center gap-3 py-2.5 text-left text-[15px]"
      onClick={onChoose}
    >
      <RadioMark on={on} />
      <span className="flex-1">{label}</span>
      <span className="num font-semibold">{amount}</span>
    </button>
  );
}

/**
 * Send payment link (the prototype's `sh-o35-link`, PAY-24): the advance or everything due where they differ, then the link to copy
 * or send on WhatsApp. It only makes the link: nothing goes to the customer until someone sends it.
 */
export function PaymentLinkSheet({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('orders');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  const make = useMakePaymentLink(order.id);
  const due = Number(order.due);
  const advance = Number(order.advanceDue);
  // PAY-24: the link asks the advance still owed, else what is due, unless staff ask for all of it.
  const choosing = advance > 0 && advance < due;
  const [full, setFull] = useState(false);
  const link = make.data;
  const refused = make.error instanceof ApiClientError ? make.error : null;
  const noMethod = refused?.details.reason === 'no_payment_method';

  if (link) {
    const phone = order.customerPhone ? bangladeshiPhone.forWhatsapp(order.customerPhone) : null;
    const message = t('linkMessage', {
      amount: formatTaka(link.amount),
      order: order.orderNumber,
      url: link.paymentUrl,
    });
    return (
      <Sheet
        open
        title={t('linkReady')}
        onClose={onClose}
        footer={
          <>
            <CopyButton text={link.paymentUrl} size="md" icon />
            {phone ? (
              <a
                href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClass('primary', 'md')}
              >
                <Icon name="message" />
                {t('linkWhatsapp')}
              </a>
            ) : null}
          </>
        }
      >
        <div>
          <Kv label={t('linkAmount')} value={formatTaka(link.amount)} />
        </div>
        <Field label={t('linkLabel')} value={link.paymentUrl} readOnly />
        <p className="m-0 text-[14px] text-fg-muted">{t('linkOpen')}</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      title={t('linkSend')}
      onClose={onClose}
      footer={
        noMethod ? undefined : (
          <Button
            wide
            busy={make.isPending}
            onClick={() => {
              make.mutate(choosing && full ? { full: true } : {});
            }}
          >
            {t('linkMake')}
          </Button>
        )
      }
    >
      {choosing ? (
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-1 text-[14px] font-medium">{t('linkAmount')}</legend>
          <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
            <LinkChoice
              on={!full}
              label={t('linkAdvance')}
              amount={formatTaka(advance)}
              onChoose={() => {
                setFull(false);
              }}
            />
            <LinkChoice
              on={full}
              label={t('linkAll')}
              amount={formatTaka(due)}
              onChoose={() => {
                setFull(true);
              }}
            />
          </div>
        </fieldset>
      ) : (
        <p className="m-0 text-[16px]">
          {t('linkOne', { amount: formatTaka(advance > 0 ? Math.min(advance, due) : due) })}
        </p>
      )}
      {noMethod ? (
        <Banner
          tone="warn"
          action={
            allows(viewer, [Permission.WalletsRead]) ? (
              <Link
                to="/$shop/settings/payment-methods"
                params={{ shop: slug }}
                className="font-semibold whitespace-nowrap text-primary underline"
              >
                {t('linkSeeMethods')}
              </Link>
            ) : undefined
          }
        >
          {t('linkNoMethod')}
        </Banner>
      ) : make.isError ? (
        <Banner tone="warn">{errorText(make.error)}</Banner>
      ) : null}
    </Sheet>
  );
}
