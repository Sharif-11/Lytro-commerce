import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  BillingPaymentState,
  Permission,
  PlanPaymentKind,
  PlanPaymentPageFrom,
} from '@lytronix/validators';
import { formatTaka, formatTakaExact } from '@lytronix/ui';
import {
  useBillingPrices,
  useCancelPayment,
  useInvoice,
  useInvoices,
  useOpenPaymentPage,
} from '@/api/billing';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Kv } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { TimelineRow } from '@/components/ui/timeline';
import { appConfig } from '@/lib/app-config';
import { dayKey, formatDayMonth, formatDayMonthYear, formatTime } from '@/lib/dates';
import { limitFigure } from '@/lib/limits';
import { bangladeshiPhone } from '@/lib/phone';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import type { BillingPayment, Invoice } from '@/types/billing';
import { HowToPaySheet } from '@/views/plan/how-to-pay-sheet';
import { explainsNoVat, type InvoiceVat, issuedOf, vatOf } from './invoice-vat';
import { PaymentState } from './payment-row';
import { ScreenshotCard } from './screenshot-card';
import {
  forLine,
  invoiceNumber,
  lapsesInHours,
  methodWords,
  paymentName,
  timelineOf,
  type TimelineStep,
} from './payment-words';

// The limits an invoice's snapshot lists, in the order the sketch writes them.
const SNAPSHOT: readonly (
  'products' | 'orders_handled_monthly' | 'staff' | 'storage_mb' | 'bandwidth_gb'
)[] = ['products', 'orders_handled_monthly', 'staff', 'storage_mb', 'bandwidth_gb'];

/** A moment as the facts write it: "20 Oct 2026 · 11:42 am". */
function dateTime(iso: string, language: string): string {
  return `${formatDayMonthYear(iso)} · ${formatTime(iso, language)}`;
}

/** One step of "What happened" (the prototype's `.tl`), joined to the next by a line. */
function Step({ step, sameDay }: { step: TimelineStep; sameDay: string }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const when = step.now
    ? t('blNow')
    : step.at
      ? dayKey(step.at) === sameDay
        ? formatTime(step.at, i18n.language)
        : `${formatDayMonth(step.at)} · ${formatTime(step.at, i18n.language)}`
      : '';
  return <TimelineRow dot={step.dot} text={step.text} sub={step.sub} when={when} />;
}

/**
 * An invoice's head: its number, the PDF to come, and -- on a tax invoice, once Lytro is registered (D9-7) -- the
 * Mushak-6.3 title over the number (the prototype's `p99-invoice-vat`).
 */
function InvoiceHead({
  invoice,
  vat,
}: {
  invoice: Invoice;
  vat: InvoiceVat | null;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const number = (
    <h2 className="num text-[17px] font-semibold">{invoiceNumber(invoice.number, t)}</h2>
  );
  return (
    <div className="flex items-baseline justify-between gap-3">
      {vat ? (
        <div>
          <div className="mb-0.5 text-[14px] font-semibold text-neutral-700">{t('p99.mushak')}</div>
          {number}
        </div>
      ) : (
        number
      )}
      <Button tone="outline" size="xs" disabled>
        <Icon name="download" />
        PDF · {t('pdfLater')}
      </Button>
    </div>
  );
}

/**
 * A tax invoice's two parties (Mushak-6.3, Slice 9.9): the shop as it stood at issue -- its name, its owner and its
 * address -- and Lytro with its BIN and registered address.
 */
function InvoiceParties({
  invoice,
  vat,
}: {
  invoice: Invoice;
  vat: InvoiceVat;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const buyer = [invoice.shopName, invoice.ownerName].filter(Boolean).join(' · ');
  return (
    <>
      <Kv
        label={t('p99.buyer')}
        wrap
        value={
          <>
            {buyer}
            {invoice.shopAddress ? (
              <>
                <br />
                {invoice.shopAddress}
              </>
            ) : null}
          </>
        }
      />
      <Kv
        label={t('p99.seller')}
        wrap
        value={
          <>
            {vat.sellerName} · BIN <span className="num">{vat.sellerBin}</span>
            <br />
            {vat.sellerAddress}
          </>
        }
      />
    </>
  );
}

/** How an invoice was paid, and who it names: an invoice without VAT names the owner, then the shop. */
function PaidAndBilled({
  invoice,
  vat,
}: {
  invoice: Invoice;
  vat: InvoiceVat | null;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  return (
    <>
      {invoice.paymentMethod ? (
        <Kv
          label={t('paidBy')}
          value={
            invoice.paymentMethod === 'balance'
              ? t('psBalance')
              : t(invoice.paymentMethod === 'bank' ? 'trxBank' : 'trx', {
                  trx: invoice.paymentReference ?? '',
                })
          }
        />
      ) : null}
      {vat ? (
        <InvoiceParties invoice={invoice} vat={vat} />
      ) : invoice.ownerName || invoice.shopName ? (
        <Kv
          label={t('billedTo')}
          value={[invoice.ownerName, invoice.shopName].filter(Boolean).join(' · ')}
        />
      ) : null}
    </>
  );
}

/**
 * A paid plan payment's receipt (BIL-12, the prototype's invoice card), its limits under a disclosure. Once Lytro is
 * registered (D9-7, Slice 9.9) one paid in by wallet or bank is a Mushak-6.3 tax invoice: titled, issued with its time,
 * the VAT its price includes, the buyer and the seller. One paid from the balance shows no VAT, and says why.
 */
function InvoiceCard({ invoice }: { invoice: Invoice }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const discount = Number(invoice.discountAmount ?? 0);
  const price = Number(invoice.amount) + discount + Number(invoice.creditAmount);
  const snapshot = invoice.planSnapshot;
  const vat = vatOf(invoice);
  const fromBalance = invoice.paymentMethod === 'balance' && vat === null;
  const invoices = useInvoices({ enabled: fromBalance });
  const explain = fromBalance && explainsNoVat(invoice, invoices.data ?? []);
  return (
    <Card>
      <InvoiceHead invoice={invoice} vat={vat} />
      <Kv label={t('issued')} value={issuedOf(invoice, vat !== null, i18n.language)} />
      {invoice.periodStart && invoice.periodEnd ? (
        <Kv
          label={t('period')}
          value={`${formatDayMonth(invoice.periodStart)} – ${formatDayMonthYear(invoice.periodEnd)}`}
        />
      ) : null}
      {invoice.planName ? (
        <Kv
          label={t('plan')}
          value={[
            invoice.planVersion
              ? `${invoice.planName} v${String(invoice.planVersion)}`
              : invoice.planName,
            invoice.billingTermLabel,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}
      <Kv label={t('price')} value={formatTaka(price)} />
      <Kv label={t('discount')} value={formatTaka(discount)} />
      {vat ? (
        <Kv label={t('p99.vatIncl', { r: vat.rate })} value={formatTakaExact(vat.amount)} />
      ) : null}
      <Kv label={t('grandTotal')} value={formatTaka(invoice.amount)} total />
      <PaidAndBilled invoice={invoice} vat={vat} />
      {explain ? (
        <p className="mt-2.5 border-t border-dashed border-line pt-2.5 text-[14px] leading-[1.5] text-neutral-700">
          {t('p99.vatNoteBal')}
        </p>
      ) : null}
      {snapshot ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[14px] text-fg-muted">{t('limitsSnap')}</summary>
          <p className="num mt-1.5 text-[14px] text-fg-muted">
            {SNAPSHOT.flatMap((key) => {
              const figure = limitFigure(key, snapshot[key]);
              return figure === null ? [] : [`${figure} ${t(`lim.${key}`)}`];
            }).join(' · ')}
          </p>
        </details>
      ) : null}
    </Card>
  );
}

/**
 * A top-up's own invoice (D9-26, the prototype's `p99-billing-topup`): every confirmed top-up gets one, its kind and
 * what was added to the balance; once Lytro is registered, a Mushak-6.3 tax invoice with the VAT its amount includes.
 */
function TopUpInvoiceCard({ invoice }: { invoice: Invoice }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const vat = vatOf(invoice);
  return (
    <Card>
      <InvoiceHead invoice={invoice} vat={vat} />
      <Kv label={t('issued')} value={issuedOf(invoice, vat !== null, i18n.language)} />
      <Kv label={t('p99.kind')} value={t('p99.kindTopUp')} />
      <Kv label={t('p99.added')} value={formatTaka(invoice.amount)} />
      {vat ? (
        <Kv label={t('p99.vatIncl', { r: vat.rate })} value={formatTakaExact(vat.amount)} />
      ) : null}
      <Kv label={t('grandTotal')} value={formatTaka(invoice.amount)} total />
      <PaidAndBilled invoice={invoice} vat={vat} />
    </Card>
  );
}

/** Finish paying (§7.13): the wallet step for the same request, until Phase 5's page takes its place. */
function FinishPayingSheet({
  payment,
  onClose,
}: {
  payment: BillingPayment;
  onClose: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const openPage = useOpenPaymentPage();
  return (
    <Sheet
      open
      title={paymentName(payment, t, i18n.language)}
      onClose={onClose}
      footer={
        <Button
          tone="accent"
          busy={openPage.isPending || openPage.isSuccess}
          onClick={() => {
            openPage.mutate({
              paymentId: payment.id,
              topUp: payment.kind === PlanPaymentKind.TopUp,
              from: PlanPaymentPageFrom.Billing,
            });
          }}
        >
          {t('goToPage', { amount: formatTaka(payment.amount) })}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('psNote')}</p>
      {openPage.isError ? <ErrorBanner error={openPage.error} /> : null}
    </Sheet>
  );
}

/** Pay again (§7.13) for a plan bought or renewed: How to pay, with the same plan and term at today's price. */
function PayAgainSheet({
  payment,
  onClose,
  onDone,
}: {
  payment: BillingPayment;
  onClose: () => void;
  onDone: (message: string) => void;
}): React.JSX.Element | null {
  const prices = useBillingPrices(payment.billingTermId);
  const option = prices.data?.find((each) => each.planId === payment.planId);
  if (!option || !payment.billingTermId) return null;
  return (
    <HowToPaySheet
      option={option}
      termId={payment.billingTermId}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

/**
 * A payment to Lytro (TENANT-DASHBOARD-DESIGN §7.13, the prototype's `billing-*`): its name, state and amount, the
 * state's own line, the facts, the one action the state allows, then "What happened" newest first, and a paid plan's
 * invoice as its receipt.
 */
export function PaymentDetail({ payment }: { payment: BillingPayment }): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const cancel = useCancelPayment();
  const [sheet, setSheet] = useState<'finish' | 'again' | null>(null);
  const planKind = payment.kind !== PlanPaymentKind.TopUp && payment.kind !== PlanPaymentKind.Addon;
  const topUp = payment.kind === PlanPaymentKind.TopUp;
  // A plan's invoice, and since Slice 9.8 a top-up's (D9-26).
  const invoice = useInvoice((planKind || topUp) && payment.invoice ? payment.invoice.id : null);
  const mayAct =
    !payment.earlierShop &&
    allows(viewer, [topUp ? Permission.BalanceManage : Permission.PaymentsManage]);
  const period =
    invoice.data?.periodStart && invoice.data.periodEnd
      ? `${formatDayMonth(invoice.data.periodStart)} – ${formatDayMonthYear(invoice.data.periodEnd)}`
      : null;
  const submitted =
    payment.submittedAt ?? (payment.method === 'balance' ? payment.verifiedAt : null);

  function payAgain(): void {
    if (topUp) {
      void navigate({ to: '/$shop/balance', params: { shop: slug }, search: { topup: 1 } });
    } else if (payment.kind === PlanPaymentKind.Upgrade) {
      void navigate({ to: '/$shop/plan', params: { shop: slug } });
    } else {
      setSheet('again');
    }
  }

  const contact = (
    <a href={appConfig.contactUrl()} className={buttonClass('outline', 'md')}>
      {t('contactSupport')}
    </a>
  );
  const again =
    payment.kind === PlanPaymentKind.Addon ? null : (
      <Button tone="accent" onClick={payAgain}>
        {t('blPayAgain')}
      </Button>
    );
  const actions = !mayAct ? null : payment.state === BillingPaymentState.Rejected ? (
    <>
      {again}
      {contact}
    </>
  ) : payment.state === BillingPaymentState.Expired ||
    payment.state === BillingPaymentState.Cancelled ? (
    again
  ) : payment.state === BillingPaymentState.Awaiting ? (
    <>
      {payment.kind === PlanPaymentKind.Addon ? null : (
        <Button
          tone="accent"
          onClick={() => {
            setSheet('finish');
          }}
        >
          {t('blFinish')}
        </Button>
      )}
      <Button
        tone="outline"
        busy={cancel.isPending}
        onClick={() => {
          cancel.mutate(payment, {
            onSuccess: () => {
              showToast(t('blCancelledToast'));
            },
          });
        }}
      >
        {t('blCancel')}
      </Button>
    </>
  ) : payment.state === BillingPaymentState.Checking ? (
    <a href={appConfig.contactUrl()} className={buttonClass('ghost', 'md')}>
      {t('contactSupport')}
    </a>
  ) : topUp ? (
    <Button
      tone="ghost"
      onClick={() => {
        void navigate({ to: '/$shop/balance', params: { shop: slug } });
      }}
    >
      {t('blSeeStatement')}
    </Button>
  ) : null;

  const steps = timelineOf(payment, t, invoice.data ?? null);
  return (
    <>
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] text-fg-muted">
            {paymentName(payment, t, i18n.language)}
          </span>
          <PaymentState state={payment.state} />
        </div>
        <div className="num mt-1 mb-3 text-[32px] font-semibold tracking-[-0.02em]">
          {formatTaka(payment.amount)}
        </div>
        {payment.state === BillingPaymentState.Checking ? (
          <p className="mb-3 text-[14px] text-fg-muted">{t('blCheckingLead')}</p>
        ) : payment.state === BillingPaymentState.Rejected ? (
          <>
            <Banner tone="bad">
              <b>{t('blNote')}:</b> {payment.note}
            </Banner>
            <p className="my-3 text-[14px] text-fg-muted">{t('blRejectedLead')}</p>
          </>
        ) : payment.state === BillingPaymentState.Expired ? (
          <p className="mb-3 text-[14px] text-fg-muted">{t('blExpiredLead')}</p>
        ) : payment.state === BillingPaymentState.Cancelled ? (
          <p className="mb-3 text-[14px] text-fg-muted">{t('blCancelledLead')}</p>
        ) : payment.state === BillingPaymentState.Awaiting ? (
          <div className="mb-3">
            <Banner tone="warn">{t('blAwaitingLead', { hours: lapsesInHours(payment) })}</Banner>
          </div>
        ) : null}
        <Kv label={t('blFor')} value={forLine(payment, t, i18n.language, period)} />
        {payment.method ? <Kv label={t('paidBy')} value={methodWords(payment, t)} /> : null}
        {payment.senderNumber ? (
          <Kv label={t('blSentFrom')} value={bangladeshiPhone.grouped(payment.senderNumber)} />
        ) : null}
        <Kv
          label={submitted ? t('blSubmitted') : t('blRequested')}
          value={dateTime(submitted ?? payment.quotedAt, i18n.language)}
        />
        {payment.invoice ? (
          <Kv label={t('blInvoice')} value={invoiceNumber(payment.invoice.number, t)} />
        ) : null}
        {actions ? <div className="mt-3.5 flex flex-wrap gap-2">{actions}</div> : null}
        {cancel.isError ? (
          <div className="mt-3">
            <ErrorBanner error={cancel.error} />
          </div>
        ) : null}
      </Card>
      {payment.state === BillingPaymentState.Checking ? (
        <ScreenshotCard payment={payment} mayAct={mayAct} />
      ) : null}
      <Card>
        <h3 className="mb-1 text-[17px] font-semibold">{t('blHistory')}</h3>
        <div className="mt-2 flex flex-col">
          {steps.map((step) => (
            <Step key={step.key} step={step} sameDay={dayKey(payment.quotedAt)} />
          ))}
        </div>
      </Card>
      {planKind && invoice.data ? <InvoiceCard invoice={invoice.data} /> : null}
      {topUp && invoice.data ? <TopUpInvoiceCard invoice={invoice.data} /> : null}
      {sheet === 'finish' ? (
        <FinishPayingSheet
          payment={payment}
          onClose={() => {
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === 'again' ? (
        <PayAgainSheet
          payment={payment}
          onClose={() => {
            setSheet(null);
          }}
          onDone={(message) => {
            setSheet(null);
            showToast(message);
          }}
        />
      ) : null}
    </>
  );
}
