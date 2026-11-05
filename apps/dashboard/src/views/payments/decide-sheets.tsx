import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTaka } from '@lytronix/ui';
import { PaymentRejectReason, PaymentSessionSource } from '@lytronix/validators';
import { useRejectPayment, useVerifyPayment } from '@/api/payments';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { RadioMark } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { useErrorText } from '@/hooks/use-error-text';
import { useOrderWords } from '@/views/orders/order-words';
import type { ShopPayment } from '@/types/payments';
import { amountInField, REJECT_REASONS, rejectWord } from './words';

function PaymentLine({ payment }: { payment: ShopPayment }): React.JSX.Element {
  const words = useOrderWords();
  return (
    <p className="num mt-[-4px] mb-2.5 text-[14px] text-fg-muted">
      {[
        words.method(payment.method),
        payment.transactionId ? `TrxID ${payment.transactionId}` : null,
        `#${payment.order.orderNumber}`,
      ]
        .filter(Boolean)
        .join(' · ')}
    </p>
  );
}

/**
 * Approve (the prototype's `sh-pay35-approve`, agreed 2026-11-05): always a sheet, since it records money and moves the order on.
 * The amount starts as what the SMS says, else what was asked, and staff may change it (Slice 5.3: verify what arrived).
 */
export function ApproveSheet({
  payment,
  onClose,
  onDone,
}: {
  payment: ShopPayment;
  onClose: () => void;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const verify = useVerifyPayment();
  const smsSays = payment.receipt?.amount ?? null;
  const [amount, setAmount] = useState(amountInField(smsSays ?? payment.amount));
  const value = Number(amount);
  const short = Number(payment.amount) - value;
  const refused = verify.error instanceof ApiClientError ? verify.error : null;
  const tooMuch = refused?.fieldProblems().amount !== undefined;
  const differs = smsSays !== null && Number(smsSays) !== Number(payment.amount);
  return (
    <Sheet
      open
      title={t('spApproveTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={verify.isPending}
          disabled={!(value > 0)}
          onClick={() => {
            verify.mutate(
              { id: payment.id, amount },
              {
                onSuccess: () => {
                  onDone(
                    t('spApproved', {
                      amount: formatTaka(amount),
                      order: `#${payment.order.orderNumber}`,
                    }),
                  );
                },
              },
            );
          }}
        >
          {t('spApprove')}
        </Button>
      }
    >
      <PaymentLine payment={payment} />
      <Field
        label={t('spArrived')}
        prefix="৳"
        inputMode="decimal"
        value={amount}
        help={
          tooMuch
            ? undefined
            : differs
              ? t('spSmsHelp', {
                  sms: formatTaka(smsSays),
                  asked: formatTaka(payment.amount),
                })
              : t('spAskedHelp', { asked: formatTaka(payment.amount) })
        }
        error={tooMuch ? t('spTooMuch') : undefined}
        onChange={(event) => {
          setAmount(event.target.value.replace(/[^\d.]/g, ''));
          verify.reset();
        }}
      />
      {value > 0 && short > 0 ? (
        <Banner tone="neutral">{t('spLeftDue', { amount: formatTaka(short) })}</Banner>
      ) : null}
      {verify.isError && !tooMuch ? <Banner tone="bad">{errorText(verify.error)}</Banner> : null}
    </Sheet>
  );
}

/**
 * Reject (the prototype's `sh-pay35-reject`, PAY-14, D5-4): a reason the shopper will read, and what happens to the order. A
 * checkout's order is cancelled and its stock let go; one staff sent a link for stays as it is.
 */
export function RejectSheet({
  payment,
  onClose,
  onDone,
}: {
  payment: ShopPayment;
  onClose: () => void;
  onDone: (message: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const errorText = useErrorText();
  const reject = useRejectPayment();
  const [reason, setReason] = useState<PaymentRejectReason>(PaymentRejectReason.NoPaymentFound);
  const [note, setNote] = useState('');
  const needsNote = reason === PaymentRejectReason.Other;
  const noteMissing = needsNote && note.trim().length === 0;
  return (
    <Sheet
      open
      title={t('spRejectTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onClose}>
            {t('spKeep')}
          </Button>
          <Button
            tone="danger"
            busy={reject.isPending}
            disabled={noteMissing}
            onClick={() => {
              reject.mutate(
                {
                  id: payment.id,
                  reason,
                  ...(needsNote ? { note: note.trim() } : {}),
                },
                {
                  onSuccess: () => {
                    onDone(t('spGotRejected'));
                  },
                },
              );
            }}
          >
            {t('spReject')}
          </Button>
        </>
      }
    >
      <PaymentLine payment={payment} />
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 text-[14px] font-medium">{t('spWhy')}</legend>
        <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
          {REJECT_REASONS.map((each) => (
            <button
              key={each}
              type="button"
              role="radio"
              aria-checked={reason === each}
              className="flex min-h-11 w-full items-center gap-3 py-2.5 text-left text-[15px]"
              onClick={() => {
                setReason(each);
              }}
            >
              <RadioMark on={reason === each} />
              <span>{rejectWord(each, t)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {needsNote ? (
        <Field
          label={t('spNote')}
          value={note}
          maxLength={500}
          help={t('spNoteNeed')}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      ) : null}
      <Banner tone="warn">
        {payment.source === PaymentSessionSource.Checkout
          ? t('spRejectCheckout', { order: `#${payment.order.orderNumber}` })
          : t('spRejectLink')}
      </Banner>
      {reject.isError ? <Banner tone="bad">{errorText(reject.error)}</Banner> : null}
    </Sheet>
  );
}
