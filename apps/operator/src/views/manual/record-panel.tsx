import { useEffect, useId, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, errorMessage } from '@lytronix/api-client';
import { SelectField, TextField } from '@lytronix/ui';
import {
  EVIDENCE_CONTENT_TYPES,
  EVIDENCE_MAX_BYTES,
  MANUAL_ENTRY_CONFIRM_ABOVE_TAKA,
  ManualEntryKind,
  ServerFieldProblemCode,
} from '@lytronix/validators';
import { uploadEvidence, useEntryPreview, useRecordEntry } from '@/api/manual-entries';
import { usePaymentMethods } from '@/api/payment-methods';
import { usePlans } from '@/api/plans';
import { useBillingTerms } from '@/api/billing-terms';
import { usePlatformWallets } from '@/api/platform-wallets';
import { useSearchShops } from '@/api/shops';
import { ActionPanel } from '@/components/ui/action-panel';
import { Banner } from '@/components/ui/banner';
import { Consequence } from '@/components/ui/consequence';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { MoneyField } from '@/components/ui/money-field';
import { ReasonField } from '@/components/ui/reason-field';
import { TWO_FIELDS } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { fromDhakaInput } from '@/lib/dhaka-time';
import { formatDay, taka } from '@/lib/format';
import { termLabel } from '@/lib/term-label';
import type { TenantSummary } from '@/types/operator';
import { Choice, Choices } from '@/views/notices/choice';
import { bankLabel, walletLabel } from './entry-words';
import { FieldLabel } from './parts';

const SEARCH_SETTLE_MS = 300;
const SHOP_CHOICES = 6;
const KB = 1024;
const KINDS = [ManualEntryKind.Plan, ManualEntryKind.Upgrade, ManualEntryKind.TopUp] as const;
const KIND_WORDS: Record<ManualEntryKind, string> = {
  [ManualEntryKind.Plan]: 'Plan',
  [ManualEntryKind.Upgrade]: 'Upgrade',
  [ManualEntryKind.TopUp]: 'TopUp',
};

type Shot =
  | { state: 'none' }
  | { state: 'sending'; name: string }
  | { state: 'sent'; name: string; bytes: number; key: string }
  | { state: 'refused' | 'failed' };

/** What a number typed as money reads as, or null. */
function amountOf(typed: string): number | null {
  const value = Number(typed.replace(/,/g, ''));
  return typed.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
}

/** The shop, found by name, address or phone, with its state and plan under it. */
function ShopPicker({
  shop,
  onPick,
}: {
  shop: TenantSummary | null;
  onPick: (shop: TenantSummary | null) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const [typed, setTyped] = useState('');
  const [sent, setSent] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSent(typed.trim());
    }, SEARCH_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);
  const found = useSearchShops(sent);
  const choices =
    shop || sent === '' ? [] : (found.data?.pages[0]?.entries ?? []).slice(0, SHOP_CHOICES);
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>{t('manual.shop')}</FieldLabel>
      <div className="flex h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-fg-subtle focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
        <ConsoleIcon name="search" />
        <input
          id={id}
          type="search"
          data-autofocus
          autoComplete="off"
          placeholder={t('manual.shopSearch')}
          value={shop ? shop.shopName : typed}
          onChange={(event) => {
            setTyped(event.target.value);
            if (shop) onPick(null);
          }}
          className="min-w-0 flex-1 bg-transparent text-input text-ink outline-none placeholder:text-placeholder"
        />
      </div>
      {shop ? (
        <div className="text-[13px] text-fg-muted">
          {shop.slug}.lytro.app · {t(`states.${shop.state}`)} · {shop.planName ?? '—'}
        </div>
      ) : null}
      {choices.length > 0 ? (
        <ul className="overflow-hidden rounded-lg border border-line bg-surface">
          {choices.map((each) => (
            <li key={each.id} className="border-t border-line first:border-t-0">
              <button
                type="button"
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-hover"
                onClick={() => {
                  onPick(each);
                }}
              >
                <span className="text-[14px] font-medium">{each.shopName}</span>
                <span className="text-[12px] text-fg-muted">
                  {each.slug}.lytro.app · {t(`states.${each.state}`)} · {each.planName ?? '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : sent !== '' && !shop && found.data ? (
        <div className="text-[13px] text-fg-muted">{t('manual.noShop')}</div>
      ) : null}
    </div>
  );
}

/** ADM-14: a screenshot (JPG, PNG, WebP or PDF up to 5 MB) or the statement line typed out; one is required. */
function EvidenceField({
  shot,
  onShot,
  line,
  onLine,
}: {
  shot: Shot;
  onShot: (shot: Shot) => void;
  line: string;
  onLine: (line: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const fileId = useId();
  const lineId = useId();

  function send(file: File | undefined): void {
    if (!file) return;
    const allowed = (EVIDENCE_CONTENT_TYPES as readonly string[]).includes(file.type);
    if (!allowed || file.size > EVIDENCE_MAX_BYTES) {
      onShot({ state: 'refused' });
      return;
    }
    onShot({ state: 'sending', name: file.name });
    uploadEvidence(file).then(
      (key) => {
        onShot({ state: 'sent', name: file.name, bytes: file.size, key });
      },
      () => {
        onShot({ state: 'failed' });
      },
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={fileId}>{t('manual.evidence')}</FieldLabel>
      {shot.state === 'sent' ? (
        <div className="flex items-center gap-3 rounded-lg border-[1.5px] border-brand-300 bg-brand-50 px-3.5 py-3 text-[13px] leading-[1.45] text-fg-muted">
          <ConsoleIcon name="image" />
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-semibold break-all text-ink">{shot.name}</b>
            {Math.round(shot.bytes / KB)} KB · {t('manual.uploadHelp')}
          </span>
          <button
            type="button"
            aria-label={t('manual.removeShot')}
            className="inline-flex size-7 flex-none items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100"
            onClick={() => {
              onShot({ state: 'none' });
            }}
          >
            <ConsoleIcon name="x" size={18} />
          </button>
        </div>
      ) : (
        <label
          htmlFor={fileId}
          onDragOver={(event: DragEvent) => {
            event.preventDefault();
          }}
          onDrop={(event: DragEvent) => {
            event.preventDefault();
            send(event.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] border-dashed px-3.5 py-3 text-[13px] leading-[1.45] text-fg-muted ${
            shot.state === 'refused' || shot.state === 'failed'
              ? 'border-danger'
              : 'border-line-strong'
          }`}
        >
          <ConsoleIcon name="upload" />
          <span className="min-w-0 flex-1">
            <b className="block text-[14px] font-semibold text-ink">
              {shot.state === 'sending' ? t('manual.uploading') : t('manual.upload')}
            </b>
            {t('manual.uploadHelp')}
          </span>
          <input
            id={fileId}
            type="file"
            accept={EVIDENCE_CONTENT_TYPES.join(',')}
            className="sr-only"
            disabled={shot.state === 'sending'}
            onChange={(event) => {
              send(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
      )}
      {shot.state === 'refused' || shot.state === 'failed' ? (
        <span role="alert" className="text-[13px] text-danger">
          {shot.state === 'refused' ? t('manual.uploadRefused') : t('manual.uploadFailed')}
        </span>
      ) : null}
      <div className="flex items-center gap-2.5 text-[12px] font-semibold text-neutral-700 before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
        <label htmlFor={lineId}>{t('manual.orLine')}</label>
      </div>
      <div className="flex min-h-field items-center rounded-control border border-control-line bg-field focus-within:border-line-active focus-within:ring-2 focus-within:ring-field-ring">
        <textarea
          id={lineId}
          name="evidenceLine"
          rows={3}
          value={line}
          onChange={(event) => {
            onLine(event.target.value);
          }}
          className="min-w-0 flex-1 resize-y bg-transparent px-field py-2.5 text-input text-fg focus:outline-none"
        />
      </div>
    </div>
  );
}

/**
 * ADM-14, ADM-15, D8-51, D8-75: record a payment that reached Lytro outside the normal flow. A plan or an upgrade is priced
 * by the seller's own code (the preview), and its amount can't be typed; a top-up is what arrived. It activates exactly as
 * approving it in the queue would.
 */
export function RecordPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const plans = usePlans();
  const terms = useBillingTerms();
  const wallets = usePlatformWallets();
  const methods = usePaymentMethods();
  const record = useRecordEntry();
  const [shop, setShop] = useState<TenantSummary | null>(null);
  const [kind, setKind] = useState<ManualEntryKind>(ManualEntryKind.Plan);
  const [planId, setPlanId] = useState('');
  const [termId, setTermId] = useState('');
  const [typedAmount, setTypedAmount] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [toBank, setToBank] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [sender, setSender] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [shot, setShot] = useState<Shot>({ state: 'none' });
  const [line, setLine] = useState('');
  const [reason, setReason] = useState('');

  const forSale = (plans.data ?? []).filter((plan) => plan.forSale);
  const visibleTerms = (terms.data ?? []).filter((term) => term.visible && !term.retiredAt);
  const onWallets = (wallets.data ?? []).filter((wallet) => wallet.enabled);
  const accounts = methods.data?.bankAccounts ?? [];
  const plan = planId || forSale[0]?.id || '';
  const term = termId || visibleTerms[0]?.id || '';
  const wallet = walletId || onWallets[0]?.id || '';
  const account = bankAccountId || accounts[0]?.id || '';
  const topUp = kind === ManualEntryKind.TopUp;
  const typed = amountOf(typedAmount);

  const preview = useEntryPreview(
    shop && (topUp ? typed !== null : plan !== '' && term !== '')
      ? topUp
        ? { tenantId: shop.id, kind, amount: typed ?? undefined }
        : { tenantId: shop.id, kind, planId: plan, billingTermId: term }
      : null,
  );
  const priced = preview.data;
  const amount = topUp ? typed : priced ? Number(priced.amount) : null;
  const confirming = priced?.needsConfirmation === true;
  const confirmed = amountOf(confirmation);
  const paidAtIso = fromDhakaInput(paidAt);

  const refusal = record.error instanceof ApiClientError ? record.error : null;
  const fields = refusal?.fieldProblems() ?? {};
  const usedId = (
    refusal?.details.fields as { field?: string; problem?: string }[] | undefined
  )?.some(
    (each) => each.field === 'transactionId' && each.problem === ServerFieldProblemCode.AlreadyUsed,
  );
  const changedTo =
    refusal?.code === 'conflict' && typeof refusal.details.amount === 'string'
      ? refusal.details.amount
      : null;
  const otherError =
    record.isError && !usedId && changedTo === null && Object.keys(fields).length === 0
      ? errorMessage(record.error, t)
      : null;

  const planOf = forSale.find((each) => each.id === plan);
  const termOf = visibleTerms.find((each) => each.id === term);

  const canSubmit =
    shop !== null &&
    amount !== null &&
    transactionId.trim() !== '' &&
    (toBank ? account !== '' : wallet !== '' && sender.trim() !== '') &&
    paidAtIso !== null &&
    shot.state !== 'sending' &&
    (shot.state === 'sent' || line.trim() !== '') &&
    reason.trim() !== '' &&
    (!confirming || confirmed !== null) &&
    (topUp || priced !== undefined);

  function submit(): void {
    if (!shop || amount === null || paidAtIso === null) return;
    record.mutate(
      {
        tenantId: shop.id,
        kind,
        ...(topUp ? {} : { planId: plan, billingTermId: term }),
        amount,
        ...(confirming && confirmed !== null ? { amountConfirmation: confirmed } : {}),
        ...(toBank
          ? { bankAccountId: account }
          : { walletId: wallet, senderNumber: sender.trim() }),
        transactionId: transactionId.trim(),
        paidAt: paidAtIso,
        ...(shot.state === 'sent' ? { evidenceKey: shot.key } : {}),
        ...(line.trim() ? { evidenceLine: line.trim() } : {}),
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast(
            topUp || !priced?.periodEnd
              ? t('manual.recordedTopUp', { a: taka(amount), shop: shop.shopName })
              : t('manual.recorded', {
                  shop: shop.shopName,
                  plan: planOf?.name ?? '',
                  d: formatDay(priced.periodEnd),
                }),
          );
          onClose();
        },
        onError: () => {
          void preview.refetch();
        },
      },
    );
  }

  const usedWords = toBank ? t('manual.refUsed') : t('manual.trxUsed');

  return (
    <ActionPanel
      title={t('manual.record')}
      onClose={onClose}
      actionLabel={t('manual.recordButton', { a: amount === null ? '৳' : taka(amount) })}
      pending={record.isPending}
      error={otherError}
      canSubmit={canSubmit}
      onSubmit={submit}
    >
      {changedTo !== null ? (
        <Banner tone="bad" icon="warn">
          {t('manual.changed', { a: taka(changedTo) })}
        </Banner>
      ) : null}
      <ShopPicker shop={shop} onPick={setShop} />
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{t('manual.kind')}</FieldLabel>
        <Choices>
          {KINDS.map((each) => (
            <Choice
              key={each}
              name="kind"
              on={kind === each}
              label={t(`manual.kind${KIND_WORDS[each]}`)}
              help={t(`manual.kind${KIND_WORDS[each]}Help`)}
              onPick={() => {
                setKind(each);
                setConfirmation('');
              }}
            />
          ))}
        </Choices>
      </div>
      {topUp ? null : (
        <>
          <div className={TWO_FIELDS}>
            <SelectField
              label={t('manual.plan')}
              name="planId"
              value={plan}
              onChange={(event) => {
                setPlanId(event.target.value);
              }}
            >
              {forSale.map((each) => (
                <option key={each.id} value={each.id}>
                  {each.name} v{each.version}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('manual.term')}
              name="billingTermId"
              value={term}
              onChange={(event) => {
                setTermId(event.target.value);
              }}
            >
              {visibleTerms.map((each) => (
                <option key={each.id} value={each.id}>
                  {termLabel(each, i18n.language)}
                </option>
              ))}
            </SelectField>
          </div>
          {priced ? (
            <div className="flex flex-col gap-1 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-3 text-[14px]">
              <span className="text-[12px] font-bold tracking-[0.04em] text-brand-800 uppercase bn:text-[13px] bn:tracking-normal bn:normal-case">
                {t('manual.previewTitle')}
              </span>
              <span>
                <b className="font-semibold">{t(`paymentKinds.${priced.kind}`)}</b> ·{' '}
                {planOf ? `${planOf.name} v${String(planOf.version)}` : ''} ·{' '}
                {termOf ? termLabel(termOf, i18n.language) : ''} ·{' '}
                <b className="font-semibold tabular-nums">{taka(priced.amount)}</b>
              </span>
              {priced.periodEnd ? (
                <span>{t('manual.previewUntil', { d: formatDay(priced.periodEnd) })}</span>
              ) : null}
              {priced.addons.length > 0 ? (
                <span>
                  {t('manual.previewAddons', {
                    a: priced.addons
                      .map(
                        (addon) =>
                          `${i18n.language === 'bn' ? addon.labelBn : addon.labelEn} ×${String(addon.quantity)}`,
                      )
                      .join(', '),
                  })}
                </span>
              ) : null}
              <span className="text-[13px] text-neutral-700">{t('manual.previewNote')}</span>
            </div>
          ) : preview.isError ? (
            <Banner tone="bad" icon="warn">
              {errorMessage(preview.error, t)}
            </Banner>
          ) : null}
        </>
      )}
      <MoneyField
        label={t('manual.amount')}
        name="amount"
        value={
          topUp
            ? typedAmount
            : priced
              ? Number(priced.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })
              : ''
        }
        onChange={setTypedAmount}
        disabled={!topUp}
        startHere={false}
        error={fields.amount}
      />
      {confirming ? (
        <>
          <Banner tone="warn" icon="warn">
            {amount !== null && amount > MANUAL_ENTRY_CONFIRM_ABOVE_TAKA
              ? t('manual.confirmBanner')
              : t('manual.confirmBannerMany')}
          </Banner>
          <MoneyField
            label={t('manual.confirm')}
            name="amountConfirmation"
            value={confirmation}
            onChange={setConfirmation}
            startHere={false}
            error={
              confirmed !== null && amount !== null && confirmed !== amount
                ? t('manual.confirmDiffers')
                : undefined
            }
          />
        </>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <FieldLabel>{t('manual.where')}</FieldLabel>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          <Choice
            name="where"
            on={!toBank}
            label={t('manual.whereWallet')}
            onPick={() => {
              setToBank(false);
            }}
          />
          <Choice
            name="where"
            on={toBank}
            label={t('manual.whereBank')}
            onPick={() => {
              setToBank(true);
            }}
          />
        </div>
      </div>
      {toBank ? (
        <>
          <SelectField
            label={t('manual.bank')}
            name="bankAccountId"
            value={account}
            onChange={(event) => {
              setBankAccountId(event.target.value);
            }}
          >
            {accounts.map((each) => (
              <option key={each.id} value={each.id}>
                {bankLabel(each, true)}
              </option>
            ))}
          </SelectField>
          <TextField
            label={t('manual.ref')}
            name="transactionId"
            mono
            autoComplete="off"
            value={transactionId}
            onChange={(event) => {
              setTransactionId(event.target.value);
            }}
            error={usedId ? usedWords : fields.transactionId}
            hint={t('manual.refHelp')}
          />
        </>
      ) : (
        <>
          <SelectField
            label={t('manual.wallet')}
            name="walletId"
            value={wallet}
            onChange={(event) => {
              setWalletId(event.target.value);
            }}
          >
            {onWallets.map((each) => (
              <option key={each.id} value={each.id}>
                {walletLabel(each)}
              </option>
            ))}
          </SelectField>
          <div className={TWO_FIELDS}>
            <TextField
              label={t('manual.trx')}
              name="transactionId"
              mono
              autoComplete="off"
              value={transactionId}
              onChange={(event) => {
                setTransactionId(event.target.value);
              }}
              error={usedId ? usedWords : fields.transactionId}
            />
            <TextField
              label={t('manual.sender')}
              name="senderNumber"
              mono
              inputMode="tel"
              autoComplete="off"
              value={sender}
              onChange={(event) => {
                setSender(event.target.value);
              }}
              error={fields.senderNumber}
            />
          </div>
        </>
      )}
      <TextField
        label={t('manual.paidAt')}
        name="paidAt"
        type="datetime-local"
        mono
        value={paidAt}
        onChange={(event) => {
          setPaidAt(event.target.value);
        }}
        error={fields.paidAt}
      />
      <EvidenceField shot={shot} onShot={setShot} line={line} onLine={setLine} />
      <Consequence>{topUp ? t('manual.consTopUp') : t('manual.consPlan')}</Consequence>
      <ReasonField value={reason} onChange={setReason} help={t('manual.reasonHelp')} />
    </ActionPanel>
  );
}
