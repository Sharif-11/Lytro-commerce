import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlanPaymentKind, PlanPaymentStatus } from '@lytronix/validators';
import { useApprovePayment, usePaymentQueue, useRejectPayment } from '@/api/payment-queue';
import { usePlans } from '@/api/plans';
import { errorMessage } from '@lytronix/api-client';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Detail,
  EmptyLine,
  ErrorBanner,
  formatDateTime,
  formatTaka,
  Notice,
  Page,
  PageHeader,
  Tag,
  TextArea,
} from '@lytronix/ui';
import type { PlanPayment } from '@/types/operator';

const KINDS = Object.values(PlanPaymentKind);

/** ADM-06: every wallet payment waiting for a human match against the wallet statement. Approving activates
    the plan or credits the balance in the same call; rejecting records a note the seller will see. */
export function PaymentQueue(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<PlanPaymentKind | null>(null);
  const queue = usePaymentQueue(kind);
  const plans = usePlans();
  const approve = useApprovePayment();
  const reject = useRejectPayment();
  const [rejecting, setRejecting] = useState<PlanPayment | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const planName = (id: string | null): string =>
    plans.data?.find((plan) => plan.id === id)?.name ?? '–';

  function closeReject(): void {
    setRejecting(null);
    setNote('');
    reject.reset();
  }

  return (
    <Page>
      <PageHeader title={t('queue.title')} lead={t('queue.lead')} />
      <div className="flex flex-wrap gap-2">
        <Chip
          selected={kind === null}
          onClick={() => {
            setKind(null);
          }}
        >
          {t('queue.allKinds')}
        </Chip>
        {KINDS.map((option) => (
          <Chip
            key={option}
            selected={kind === option}
            onClick={() => {
              setKind(option);
            }}
          >
            {t(`paymentKinds.${option}`)}
          </Chip>
        ))}
      </div>

      {done ? <Notice tone="success">{done}</Notice> : null}
      {approve.isError ? <ErrorBanner message={errorMessage(approve.error, t)} /> : null}
      {queue.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {queue.isError ? <ErrorBanner message={errorMessage(queue.error, t)} /> : null}
      {queue.data && queue.data.length === 0 ? <EmptyLine>{t('queue.empty')}</EmptyLine> : null}

      {queue.data?.map((payment) => (
        <Card key={payment.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-[22px] font-bold text-fg">
                {formatTaka(payment.amount)}
              </span>
              <Tag tone="brand">{t(`paymentKinds.${payment.kind}`)}</Tag>
              <Tag tone={payment.status === PlanPaymentStatus.NeedsReview ? 'accent' : 'neutral'}>
                {t(`paymentStatuses.${payment.status}`)}
              </Tag>
            </div>
            <p className="text-[13px] text-fg-muted">
              {formatDateTime(payment.createdAt, i18n.language)}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label={t('queue.tenant')}>
              <span className="mono text-[13px]">{payment.tenantId}</span>
            </Detail>
            <Detail label={t('queue.plan')}>{planName(payment.planId)}</Detail>
            <Detail label={t('queue.sender')}>{payment.senderNumber ?? '–'}</Detail>
            <Detail label={t('queue.transaction')}>
              <span className="mono">{payment.transactionId ?? '–'}</span>
            </Detail>
            {Number(payment.creditAmount) > 0 ? (
              <Detail label={t('queue.credit')}>{formatTaka(payment.creditAmount)}</Detail>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              small
              fit
              loading={approve.isPending && approve.variables === payment.id}
              onClick={() => {
                setDone(null);
                approve.mutate(payment.id, {
                  onSuccess: () => {
                    setDone(t('queue.approved', { amount: formatTaka(payment.amount) }));
                  },
                });
              }}
            >
              {t('queue.approve')}
            </Button>
            <Button
              type="button"
              tone="danger"
              small
              fit
              onClick={() => {
                setDone(null);
                setRejecting(payment);
              }}
            >
              {t('queue.reject')}
            </Button>
          </div>
        </Card>
      ))}

      <ConfirmDialog
        open={rejecting !== null}
        title={t('queue.rejectTitle')}
        message={
          <TextArea
            label={t('queue.rejectNote')}
            name="note"
            required
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        }
        error={reject.isError ? errorMessage(reject.error, t) : null}
        confirmLabel={t('queue.reject')}
        danger
        pending={reject.isPending}
        onConfirm={() => {
          if (!rejecting || note.trim() === '') return;
          reject.mutate(
            { id: rejecting.id, note: note.trim() },
            {
              onSuccess: () => {
                closeReject();
                setDone(t('queue.rejected'));
              },
            },
          );
        }}
        onCancel={closeReject}
      />
    </Page>
  );
}
