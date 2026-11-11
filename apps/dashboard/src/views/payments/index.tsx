import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { formatTaka } from '@lytronix/ui';
import {
  ListenerDeviceStatus,
  PaymentListStatus,
  PaymentMethod,
  PaymentWay,
  Permission,
} from '@lytronix/validators';
import { useHome } from '@/api/home';
import { useListenerPhones, usePhoneReceipts } from '@/api/listener';
import { usePaymentMethods } from '@/api/payment-methods';
import { downloadPayments, usePayments, useToVerifyCount } from '@/api/payments';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { MethodMark } from '@/components/method-mark';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { rowClass, RowList } from '@/components/ui/list-row';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { dayLabel, formatDayMonthYear, formatTime, groupByDay } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { PhoneReceipt, ShopPayment } from '@/types/payments';
import { PhoneHealthBanner } from '@/views/listener/phone-health';
import { useOrderWords } from '@/views/orders/order-words';
import { ApproveSheet, RejectSheet } from './decide-sheets';
import { PayoutsList } from './payouts';
import { PaymentDetailSheet, ReceiptSheet } from './detail-sheets';
import { receiptStatusOf, reviewLineOf, statusOf } from './words';

// Courier payouts last (Part 36, agreed 2026-11-06: a tab on Payments, for whoever may read payments).
const TABS = [
  'verify',
  'receipts',
  'all',
  'verified',
  'rejected',
  'refunded',
  'voided',
  'payouts',
] as const;
type PaymentsTab = (typeof TABS)[number];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The tab, search and filters, in the address, so Back from an order returns to the same list. */
export const paymentsSearch = z.object({
  tab: z.enum(TABS).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  method: z.nativeEnum(PaymentMethod).optional().catch(undefined),
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
});
export type PaymentsSearch = z.infer<typeof paymentsSearch>;

const STATUS_OF_TAB: Partial<Record<PaymentsTab, PaymentListStatus>> = {
  verify: PaymentListStatus.ToVerify,
  verified: PaymentListStatus.Verified,
  rejected: PaymentListStatus.Rejected,
  refunded: PaymentListStatus.Refunded,
  voided: PaymentListStatus.Voided,
};

const TAB_WORD: Record<PaymentsTab, string> = {
  verify: 'spToVerify',
  receipts: 'spReceipts',
  all: 'all',
  verified: 'spVerified',
  rejected: 'spRejected',
  refunded: 'spRefunded',
  voided: 'spVoided',
  payouts: 'crPayouts',
};

// How money can come, in the order the filter lists it.
const METHODS: readonly PaymentMethod[] = [
  PaymentMethod.Bkash,
  PaymentMethod.Nagad,
  PaymentMethod.Rocket,
  PaymentMethod.Upay,
  PaymentMethod.Bank,
  PaymentMethod.Cash,
  PaymentMethod.CashOnDelivery,
];

function useDayHeading(): (iso: string) => string {
  const { t } = useTranslation('money');
  return (iso) => {
    const label = dayLabel(iso);
    if (label.kind === 'today') return t('spToday');
    if (label.kind === 'yesterday') return t('spYesterday');
    return formatDayMonthYear(iso);
  };
}

/** A row's two lines beside the amount (the prototype's `pay35Row`), each wrapping rather than cutting off an order number. */
function RowBody({
  amount,
  at,
  lines,
}: {
  amount: string;
  at?: string;
  lines: readonly React.ReactNode[];
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="num text-[16px] font-medium">
        {amount}
        {at ? <span className="text-[14px] font-normal text-fg-muted"> · {at}</span> : null}
      </span>
      {lines.map((line, at_) => (
        <span key={at_} className="num text-[14px] text-fg-muted">
          {line}
        </span>
      ))}
    </span>
  );
}

/** One payment waiting (the prototype's `pay35Verify`): what it says, why it waits, and the two decisions. */
function WaitingRow({
  payment,
  phonesPaired,
  canDecide,
  onApprove,
  onReject,
}: {
  payment: ShopPayment;
  phonesPaired: boolean;
  canDecide: boolean;
  onApprove: () => void;
  onReject: () => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const words = useOrderWords();
  const { slug } = useShell();
  const line = reviewLineOf(payment, t, phonesPaired);
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3">
      <div className="flex items-center gap-3">
        <MethodMark method={payment.method} name={words.method(payment.method)} />
        <RowBody
          amount={formatTaka(payment.amount)}
          lines={[
            [
              payment.transactionId ? `TrxID ${payment.transactionId}` : null,
              payment.senderNumber ? bangladeshiPhone.grouped(payment.senderNumber) : null,
            ]
              .filter(Boolean)
              .join(' · '),
            <>
              <Link
                to="/$shop/orders/$orderId"
                params={{ shop: slug, orderId: payment.order.id }}
                className="text-primary underline"
              >
                #{payment.order.orderNumber}
              </Link>
              {' · '}
              {formatTime(payment.at, i18n.language)}
            </>,
          ]}
        />
      </div>
      {line ? (
        <Banner tone={line.tone} dense>
          {line.text}
        </Banner>
      ) : null}
      {canDecide ? (
        <div className="flex gap-2">
          <Button tone="accent" size="sm" onClick={onApprove}>
            {t('spApprove')}
          </Button>
          <Button tone="outline" size="sm" onClick={onReject}>
            {t('spReject')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** What waits to be verified (PAY-14), oldest question first as the server lists them. */
function ToVerifyList({
  search,
  phonesPaired,
  canDecide,
  onDecide,
}: {
  search: PaymentsFilter;
  phonesPaired: boolean;
  canDecide: boolean;
  onDecide: (decision: Decision) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('money');
  const list = usePayments({ ...search, status: PaymentListStatus.ToVerify });
  if (list.isError) return <ErrorBanner error={list.error} />;
  if (!list.data) return null;
  const payments = list.data.pages.flatMap((page) => page.payments);
  if (payments.length === 0) {
    return (
      <Card>
        <EmptyState icon="check">{t(search.q ? 'spEmptyList' : 'spEmpty')}</EmptyState>
      </Card>
    );
  }
  return (
    <>
      <Card flush>
        <RowList>
          {payments.map((payment) => (
            <WaitingRow
              key={payment.id}
              payment={payment}
              phonesPaired={phonesPaired}
              canDecide={canDecide}
              onApprove={() => {
                onDecide({ kind: 'approve', payment });
              }}
              onReject={() => {
                onDecide({ kind: 'reject', payment });
              }}
            />
          ))}
        </RowList>
      </Card>
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('spMore')}
        </Button>
      ) : null}
    </>
  );
}

const tappable = `${rowClass} hover:bg-neutral-50`;

/** Every other tab (PAY-19): how many and how much the filter holds, then the rows by day. A row opens its details. */
function PaymentList({
  filter,
  onOpen,
}: {
  filter: PaymentsFilter & { status?: PaymentListStatus };
  onOpen: (payment: ShopPayment) => void;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  const words = useOrderWords();
  const heading = useDayHeading();
  const list = usePayments(filter);
  if (list.isError) return <ErrorBanner error={list.error} />;
  if (!list.data) return null;
  const payments = list.data.pages.flatMap((page) => page.payments);
  const first = list.data.pages[0];
  if (payments.length === 0 || !first) {
    return (
      <Card>
        <EmptyState icon="banknote">{t('spEmptyList')}</EmptyState>
      </Card>
    );
  }
  return (
    <>
      <p className="num m-0 text-[14px] text-fg-muted">
        {/* The server sums whatever the filter holds. Across every status that adds rejected and voided money to what really
            came in, so All counts and only a status's own tab totals. */}
        {filter.status
          ? t('spTotal', { count: first.total, amount: formatTaka(first.amount) })
          : t('spCount', { count: first.total })}
      </p>
      {groupByDay(payments, (payment) => payment.at).map((group) => (
        <Card flush key={group.key}>
          <div className="bg-neutral-50 px-4 py-2 text-[13px] font-semibold text-fg-muted">
            {heading(group.iso)}
          </div>
          <RowList>
            {group.items.map((payment) => {
              const status = statusOf(payment, t);
              return (
                <button
                  key={`${payment.kind}-${payment.id}`}
                  type="button"
                  className={tappable}
                  onClick={() => {
                    onOpen(payment);
                  }}
                >
                  <MethodMark method={payment.method} name={words.method(payment.method)} />
                  <RowBody
                    amount={formatTaka(payment.amount)}
                    at={formatTime(payment.at, i18n.language)}
                    lines={[
                      payment.transactionId
                        ? `TrxID ${payment.transactionId}`
                        : words.method(payment.method),
                      `#${payment.order.orderNumber}`,
                    ]}
                  />
                  <StatusTag tone={status.tone}>{status.word}</StatusTag>
                  <Icon name="right" />
                </button>
              );
            })}
          </RowList>
        </Card>
      ))}
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('spMore')}
        </Button>
      ) : null}
    </>
  );
}

/** Phone receipts (agreed 2026-11-05: a tab on Payments): what really arrived, money that matched no order included. */
function ReceiptList({
  search,
  phonesPaired,
  canPair,
  onOpen,
}: {
  search: string;
  phonesPaired: boolean;
  canPair: boolean;
  onOpen: (receipt: PhoneReceipt) => void;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  const words = useOrderWords();
  const heading = useDayHeading();
  const { slug } = useShell();
  const list = usePhoneReceipts(search);
  if (list.isError) return <ErrorBanner error={list.error} />;
  if (!list.data) return null;
  const receipts = list.data.pages.flatMap((page) => page.receipts);
  if (receipts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="sms"
          action={
            !phonesPaired && canPair ? (
              <Link
                to="/$shop/settings/listener"
                params={{ shop: slug }}
                className={buttonClass('primary', 'sm')}
              >
                {t('spPair')}
              </Link>
            ) : undefined
          }
        >
          {t(phonesPaired ? 'spREmpty' : 'spRNoPhone')}
        </EmptyState>
      </Card>
    );
  }
  return (
    <>
      <p className="m-0 text-[14px] text-fg-muted">{t('spRLead')}</p>
      {groupByDay(receipts, (receipt) => receipt.receivedAt).map((group) => (
        <Card flush key={group.key}>
          <div className="bg-neutral-50 px-4 py-2 text-[13px] font-semibold text-fg-muted">
            {heading(group.iso)}
          </div>
          <RowList>
            {group.items.map((receipt) => {
              const status = receiptStatusOf(receipt.status, t);
              const method = receipt.method ?? PaymentMethod.Bkash;
              return (
                <button
                  key={receipt.id}
                  type="button"
                  className={tappable}
                  onClick={() => {
                    onOpen(receipt);
                  }}
                >
                  <MethodMark method={method} name={words.method(method)} />
                  <RowBody
                    amount={receipt.amount ? formatTaka(receipt.amount) : '—'}
                    at={formatTime(receipt.receivedAt, i18n.language)}
                    lines={[
                      receipt.transactionId ? `TrxID ${receipt.transactionId}` : null,
                      receipt.senderNumber ? bangladeshiPhone.grouped(receipt.senderNumber) : null,
                    ].filter(Boolean)}
                  />
                  <StatusTag tone={status.tone}>{status.word}</StatusTag>
                  <Icon name="right" />
                </button>
              );
            })}
          </RowList>
        </Card>
      ))}
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('spMore')}
        </Button>
      ) : null}
    </>
  );
}

/** How it came and the dates (the prototype's `sh-pay35-filter`, PAY-19). */
function FilterSheet({
  search,
  onApply,
  onClose,
}: {
  search: PaymentsSearch;
  onApply: (chosen: Pick<PaymentsSearch, 'method' | 'from' | 'to'>) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('money');
  const words = useOrderWords();
  const [method, setMethod] = useState(search.method);
  const [from, setFrom] = useState(search.from ?? '');
  const [to, setTo] = useState(search.to ?? '');
  return (
    <Sheet
      open
      title={t('spFilterTitle')}
      onClose={onClose}
      footer={
        <>
          <Button
            tone="outline"
            onClick={() => {
              onApply({ method: undefined, from: undefined, to: undefined });
            }}
          >
            {t('spClear')}
          </Button>
          <Button
            onClick={() => {
              onApply({ method, from: from || undefined, to: to || undefined });
            }}
          >
            {t('spApply')}
          </Button>
        </>
      }
    >
      <div>
        <p className="mt-0 mb-1.5 text-[14px] font-medium">{t('spMethod')}</p>
        <ChipRow className="flex-wrap">
          <Chip
            on={method === undefined}
            onClick={() => {
              setMethod(undefined);
            }}
          >
            {t('all')}
          </Chip>
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
        </ChipRow>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={t('spFrom')}
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => {
            setFrom(event.target.value);
          }}
        />
        <Field
          label={t('spTo')}
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => {
            setTo(event.target.value);
          }}
        />
      </div>
    </Sheet>
  );
}

interface PaymentsFilter {
  method?: PaymentMethod;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}

type Decision = { kind: 'approve' | 'reject'; payment: ShopPayment };

/**
 * Payments (TENANT-DASHBOARD-DESIGN §7.36, the prototype's Part 35, Slice 5.8's part 3): the shop's incoming money. What waits to
 * be verified first, then the phone's receipts, then every payment by status. Whoever may read payments sees the list; deciding
 * and the receipts are for whoever may verify (PAY-14, PAY-19).
 */
export function PaymentsView({ search }: { search: PaymentsSearch }): React.JSX.Element {
  const { t } = useTranslation('money');
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const canDecide = allows(viewer, [Permission.PaymentsVerify]);
  const canSeePhones = allows(viewer, [Permission.ListenerRead]);
  const canPair = allows(viewer, [Permission.ListenerManage]);
  const canSeeMethods = allows(viewer, [Permission.WalletsRead]);

  const tab: PaymentsTab =
    search.tab === 'receipts' && !canDecide ? 'verify' : (search.tab ?? 'verify');
  const [typed, setTyped] = useState(search.q ?? '');
  const q = useDebouncedValue(typed.trim(), 300);
  const go = (next: PaymentsSearch): void => {
    void navigate({
      to: '/$shop/payments',
      params: { shop: slug },
      search: next,
      replace: true,
    });
  };
  useEffect(() => {
    if ((search.q ?? '') !== q) go({ ...search, q: q || undefined });
    // Only a new search moves the address: every other change already went through `go`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const [filtering, setFiltering] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [open, setOpen] = useState<ShopPayment | null>(null);
  const [receipt, setReceipt] = useState<PhoneReceipt | null>(null);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);

  const phones = useListenerPhones({ enabled: canSeePhones });
  const methods = usePaymentMethods({ enabled: canSeeMethods });
  const count = useToVerifyCount();
  const home = useHome();
  // A new shop's first look (the prototype's `pay35-new`): no wallet on, and no payment ever.
  const noWallet = home.data?.checklist?.wallet === false;
  const everything = usePayments({});
  const nothingYet = noWallet && everything.data?.pages[0]?.total === 0;

  const phonesPaired =
    phones.data?.devices.some((phone) => phone.status === ListenerDeviceStatus.Active) ?? false;
  // The line about phones says nothing true to a shop none of whose wallets listens: automated verifies by itself, by hand is chosen.
  const someWalletListens =
    !methods.data ||
    methods.data.methods.some((row) => row.enabled && row.way === PaymentWay.Listener);

  const filter: PaymentsFilter = {
    ...(search.method ? { method: search.method } : {}),
    ...(search.from ? { dateFrom: search.from } : {}),
    ...(search.to ? { dateTo: search.to } : {}),
    ...(q ? { q } : {}),
  };
  const status = STATUS_OF_TAB[tab];
  const tabs = TABS.filter((each) => each !== 'receipts' || canDecide);
  const filtered = Boolean(search.method ?? search.from ?? search.to);

  const download = async (): Promise<void> => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPayments({ ...filter, ...(status ? { status } : {}) });
    } catch (error) {
      setDownloadError(error);
    } finally {
      setDownloading(false);
    }
  };

  if (nothingYet && tab !== 'payouts') {
    return (
      <ShellPage>
        <Card>
          <EmptyState
            icon="banknote"
            action={
              canSeeMethods ? (
                <Link
                  to="/$shop/settings/payment-methods"
                  params={{ shop: slug }}
                  className={buttonClass('primary', 'sm')}
                >
                  {t('spAddAccount')}
                </Link>
              ) : undefined
            }
          >
            {t('spNew')}
          </EmptyState>
        </Card>
      </ShellPage>
    );
  }

  return (
    <ShellPage
      actions={
        tab === 'receipts' || tab === 'payouts' ? undefined : (
          <Button
            tone="outline"
            size="sm"
            busy={downloading}
            onClick={() => {
              void download();
            }}
          >
            <Icon name="download" />
            CSV
          </Button>
        )
      }
    >
      {downloadError ? <ErrorBanner error={downloadError} /> : null}
      {phones.data && someWalletListens && tab !== 'payouts' ? (
        <PhoneHealthBanner view={phones.data} />
      ) : null}
      {/* Courier payouts are read as the couriers sent them: nothing to search or filter (Part 36's `c36-payouts`). */}
      <div className={`flex items-center gap-2 ${tab === 'payouts' ? 'hidden' : ''}`}>
        <div className="min-w-0 flex-1">
          <SearchField
            value={typed}
            onChange={setTyped}
            placeholder={t(tab === 'receipts' ? 'spSearchReceipts' : 'spSearch')}
            label={t(tab === 'receipts' ? 'spSearchReceipts' : 'spSearch')}
          />
        </div>
        {tab === 'receipts' ? null : (
          <button
            type="button"
            aria-label={t('spFilterTitle')}
            aria-pressed={filtered}
            className={[
              'inline-flex size-11 flex-none items-center justify-center rounded-[8px] border bg-surface',
              filtered ? 'border-primary text-primary' : 'border-line-strong',
            ].join(' ')}
            onClick={() => {
              setFiltering(true);
            }}
          >
            <Icon name="filter" />
          </button>
        )}
      </div>
      <ChipRow>
        {tabs.map((each) => (
          <Chip
            key={each}
            on={tab === each}
            count={each === 'verify' && count.data ? count.data : null}
            onClick={() => {
              go({ ...search, tab: each === 'verify' ? undefined : each });
            }}
          >
            {t(TAB_WORD[each])}
          </Chip>
        ))}
      </ChipRow>

      {tab === 'verify' ? (
        <ToVerifyList
          search={filter}
          phonesPaired={phonesPaired}
          canDecide={canDecide}
          onDecide={setDecision}
        />
      ) : tab === 'receipts' ? (
        <ReceiptList search={q} phonesPaired={phonesPaired} canPair={canPair} onOpen={setReceipt} />
      ) : tab === 'payouts' ? (
        <PayoutsList />
      ) : (
        <PaymentList filter={{ ...filter, ...(status ? { status } : {}) }} onOpen={setOpen} />
      )}

      {filtering ? (
        <FilterSheet
          search={search}
          onClose={() => {
            setFiltering(false);
          }}
          onApply={(chosen) => {
            setFiltering(false);
            go({ ...search, ...chosen });
          }}
        />
      ) : null}
      {decision?.kind === 'approve' ? (
        <ApproveSheet
          payment={decision.payment}
          onClose={() => {
            setDecision(null);
          }}
          onDone={(message) => {
            setDecision(null);
            showToast(message);
          }}
        />
      ) : null}
      {decision?.kind === 'reject' ? (
        <RejectSheet
          payment={decision.payment}
          onClose={() => {
            setDecision(null);
          }}
          onDone={(message) => {
            setDecision(null);
            showToast(message);
          }}
        />
      ) : null}
      {open ? (
        <PaymentDetailSheet
          payment={open}
          onClose={() => {
            setOpen(null);
          }}
        />
      ) : null}
      {receipt ? (
        <ReceiptSheet
          receipt={receipt}
          phoneName={
            phones.data?.devices.find((phone) => phone.id === receipt.deviceId)?.name ?? null
          }
          onClose={() => {
            setReceipt(null);
          }}
        />
      ) : null}
    </ShellPage>
  );
}
