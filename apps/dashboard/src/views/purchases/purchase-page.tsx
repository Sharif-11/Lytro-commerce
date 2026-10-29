import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Permission, PURCHASE_NOTES_MAX_LENGTH, PurchaseStatus } from '@lytronix/validators';
import {
  useDeleteDraft,
  usePlacePurchase,
  usePurchase,
  useUpdatePurchase,
  type PurchaseDraft,
} from '@/api/purchases';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { RowList } from '@/components/ui/list-row';
import { SectionHead } from '@/components/ui/page';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { Purchase, PurchaseReceipt } from '@/types/purchasing';
import { useAmountText } from '../product/stock-holders';
import { AddItemSheet } from './add-item-sheet';
import { DeliverySheet } from './delivery-sheet';
import { AddItemLink, CostBox, QtyBox, RemoveLine } from './line-rows';
import { CancelSheet, CloseShortSheet, DeleteDraftSheet } from './purchase-confirm';
import {
  draftsOf,
  linesBody,
  linesOk,
  receiptTotals,
  supplierBody,
  totalOf,
  unitOf,
  withLine,
  type LineDraft,
  type SupplierValue,
} from './purchase-lines';
import { purchaseNumber, usePurchaseWords } from './purchase-words';
import { ReceiveSheet } from './receive-sheet';
import { SupplierField } from './supplier-field';

/** The sheet over the page. */
type Open =
  | { kind: 'add' | 'receive' | 'close' | 'cancel' | 'delete' }
  | { kind: 'delivery'; receipt: PurchaseReceipt };

/**
 * One purchase (TENANT-DASHBOARD-DESIGN §7.21, the prototype's `purchase` pages and Part 21; PUR-02 to PUR-08): its
 * number or Draft and its status, its supplier, expected day and notes, its items with what was ordered, received and is
 * outstanding and, for someone who may see costs, the unit cost and the total; its deliveries; and what can be done.
 */
export function PurchaseView({ purchaseId }: { purchaseId: string }): React.JSX.Element {
  const errorText = useErrorText();
  const purchase = usePurchase(purchaseId);
  if (purchase.data) {
    // A save answers with the purchase as it now is, and the page starts again from it.
    return <PurchaseBody key={purchase.data.updatedAt} saved={purchase.data} />;
  }
  return (
    <ShellPage>
      {purchase.isError ? (
        <Banner tone="bad">{errorText(purchase.error)}</Banner>
      ) : (
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      )}
    </ShellPage>
  );
}

function PurchaseBody({ saved }: { saved: Purchase }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const amount = useAmountText();
  const words = usePurchaseWords();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.InventoryManage]);
  const update = useUpdatePurchase(saved.id);
  const place = usePlacePurchase();
  const remove = useDeleteDraft(saved.id);
  const [open, setOpen] = useState<Open | null>(null);

  const first = {
    supplier: { id: saved.supplier?.id ?? null, name: saved.supplier?.name ?? '' },
    expectedOn: saved.expectedOn ?? '',
    notes: saved.notes ?? '',
    lines: draftsOf(saved, (item) => words.item(saved, item)),
  };
  const [supplier, setSupplier] = useState<SupplierValue>(first.supplier);
  const [expectedOn, setExpectedOn] = useState(first.expectedOn);
  const [notes, setNotes] = useState(first.notes);
  const [lines, setLines] = useState<LineDraft[]>(first.lines);

  const draft = saved.status === PurchaseStatus.Draft;
  const placed =
    saved.status === PurchaseStatus.Ordered || saved.status === PurchaseStatus.PartiallyReceived;
  const delivered = saved.receipts.length > 0;
  // Agreed in the 11.10 read: the supplier and the items change until the first delivery, the day and notes after.
  const itemsOpen = mayManage && (draft || (placed && !delivered));
  const detailsOpen = mayManage && (draft || placed);

  const supplierChanged =
    supplier.id !== first.supplier.id ||
    (supplier.id === null && supplier.name.trim() !== first.supplier.name);
  const linesChanged = JSON.stringify(lines) !== JSON.stringify(first.lines);
  const changes: PurchaseDraft = {
    ...(itemsOpen && supplierChanged ? supplierBody(supplier) : {}),
    ...(expectedOn === first.expectedOn
      ? {}
      : { expectedOn: expectedOn === '' ? null : expectedOn }),
    ...(notes.trim() === first.notes ? {} : { notes: notes.trim() === '' ? null : notes.trim() }),
    ...(itemsOpen && linesChanged ? { items: linesBody(lines) } : {}),
  };
  const dirty = Object.keys(changes).length > 0;
  const ready = !itemsOpen || linesOk(lines);
  const busy = update.isPending || place.isPending;

  async function placeIt(): Promise<void> {
    if (dirty) await update.mutateAsync(changes);
    await place.mutateAsync(saved.id);
  }

  const failed = [update, place, remove].find((each) => each.isError)?.error;
  const shownTotal = linesChanged
    ? totalOf(lines)
    : { total: Number(saved.total ?? 0), unknown: saved.unknownCost ?? 0 };

  const save = (word: string) => (
    <Button
      tone="outline"
      wide
      disabled={!dirty || !ready || busy}
      onClick={() => {
        update.mutate(changes);
      }}
    >
      {word}
    </Button>
  );

  const actions = !mayManage ? null : draft ? (
    <>
      <Button
        wide
        busy={busy}
        disabled={!ready}
        onClick={() => {
          void placeIt().catch(() => undefined);
        }}
      >
        {t('poPlace')}
      </Button>
      {save(t('poSaveDraft'))}
      <p className="text-[14px] text-fg-muted">{t('poPlaceHelp')}</p>
      <Button
        tone="ghost"
        wide
        onClick={() => {
          setOpen({ kind: 'delete' });
        }}
      >
        <Icon name="trash" />
        {t('poDeleteDraft')}
      </Button>
    </>
  ) : placed ? (
    <>
      <Button
        wide
        onClick={() => {
          setOpen({ kind: 'receive' });
        }}
      >
        <Icon name="truck" />
        {t('poArrived')}
      </Button>
      {/* A partly received purchase still takes a new day or notes; its Save shows once they change. */}
      {!delivered || dirty ? save(t('poSaveChanges')) : null}
      <Button
        tone="outline"
        wide
        onClick={() => {
          setOpen({ kind: delivered ? 'close' : 'cancel' });
        }}
      >
        {delivered ? t('poClose') : t('poCancel')}
      </Button>
      <p className="text-[14px] text-fg-muted">
        {!delivered
          ? t('poEditHelp')
          : saved.status === PurchaseStatus.Ordered
            ? t('poRejectedAll')
            : t('rcvHelp')}
      </p>
    </>
  ) : saved.status === PurchaseStatus.ClosedShort && saved.closeReason ? (
    <Banner tone="neutral">{t('poCloseReasonIs', { reason: saved.closeReason })}</Banner>
  ) : saved.status === PurchaseStatus.Cancelled ? (
    <Banner tone="neutral">{t('poCancelledOn', { date: formatDayMonth(saved.updatedAt) })}</Banner>
  ) : null;

  const shown = words.status(saved.status);

  return (
    <ShellPage
      title={purchaseNumber(saved.number) ?? t('poDraft')}
      titleInHeader
      actions={<StatusTag tone={shown.tone}>{shown.word}</StatusTag>}
    >
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-3">
            {itemsOpen ? (
              <SupplierField value={supplier} onChange={setSupplier} chevron />
            ) : (
              <Field
                label={t('poSupplier')}
                readOnly
                value={saved.supplier?.name ?? t('noSupplier')}
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('poExpected')}
                type={detailsOpen ? 'date' : 'text'}
                readOnly={!detailsOpen}
                placeholder="—"
                value={detailsOpen ? expectedOn : expectedOn && formatDayMonth(expectedOn)}
                suffix={detailsOpen ? undefined : <Icon name="calendar" />}
                onChange={(event) => {
                  setExpectedOn(event.target.value);
                }}
              />
              <Field
                label={t('poNotes')}
                readOnly={!detailsOpen}
                placeholder="—"
                maxLength={PURCHASE_NOTES_MAX_LENGTH}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                }}
              />
            </div>
          </Card>
          <div>
            <SectionHead
              link={
                itemsOpen ? (
                  <AddItemLink
                    onAdd={() => {
                      setOpen({ kind: 'add' });
                    }}
                  />
                ) : undefined
              }
            >
              {t('poItems')}
            </SectionHead>
            <Card flush className="mt-2">
              <RowList>
                {itemsOpen
                  ? lines.map((line) => (
                      <div
                        key={line.variantId}
                        className="flex min-h-[52px] items-center gap-2 py-2 pr-2 pl-4"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-[15px] font-medium">{line.name}</span>
                          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-fg-muted">
                            <span className="flex items-center gap-1">
                              {t('poOrdered2')}:
                              <QtyBox
                                line={line}
                                onChange={(quantity) => {
                                  setLines(withLine(lines, line.variantId, { quantity }));
                                }}
                              />
                            </span>
                            <span className="flex items-center gap-1">
                              {t('poUnitCostCol')}:
                              <CostBox
                                line={line}
                                onChange={(cost) => {
                                  setLines(withLine(lines, line.variantId, { cost }));
                                }}
                              />
                            </span>
                          </span>
                        </span>
                        <RemoveLine
                          line={line}
                          onRemove={() => {
                            setLines(lines.filter((each) => each.variantId !== line.variantId));
                          }}
                        />
                      </div>
                    ))
                  : saved.items.map((item) => {
                      const unit = unitOf(item);
                      return (
                        <div key={item.id} className="flex min-h-[52px] flex-col gap-0.5 px-4 py-2">
                          <span className="text-[15px] font-medium">{words.item(saved, item)}</span>
                          <span className="num flex flex-wrap gap-x-2.5 text-[13px] text-fg-muted">
                            <span>
                              {t('poOrdered2')}:{' '}
                              <b className="text-fg">{amount(item.quantityOrdered, unit)}</b>
                            </span>
                            <span>
                              {t('poReceivedCol')}:{' '}
                              <b className="text-fg">{amount(item.quantityReceived, unit)}</b>
                            </span>
                            <span>
                              {t('poOutstanding')}:{' '}
                              <b className="text-fg">{amount(item.outstanding, unit)}</b>
                            </span>
                            {mayManage ? (
                              <span>
                                {t('poUnitCostCol')}:{' '}
                                <b className="text-fg">
                                  {item.unitCost ? formatTaka(item.unitCost) : '—'}
                                </b>
                              </span>
                            ) : null}
                          </span>
                        </div>
                      );
                    })}
              </RowList>
            </Card>
            {mayManage ? (
              <p className="mt-2 text-[14px] text-fg-muted">
                {t('poTotal')}: <b className="num text-fg">{formatTaka(shownTotal.total)}</b>
                {shownTotal.unknown > 0
                  ? ` · ${t('poUnknownCost', { count: shownTotal.unknown })}`
                  : null}
              </p>
            ) : null}
          </div>
          {draft ? null : (
            <div>
              <SectionHead>{t('poDeliveries')}</SectionHead>
              <Card flush className="mt-2">
                {saved.receipts.length === 0 ? (
                  <p className="flex min-h-16 items-center px-4 text-[14px] text-fg-muted">
                    {t('poNoDeliveries')}
                  </p>
                ) : (
                  <RowList>
                    {saved.receipts.map((receipt) => (
                      <DeliveryRow
                        key={receipt.id}
                        purchase={saved}
                        receipt={receipt}
                        onOpen={() => {
                          setOpen({ kind: 'delivery', receipt });
                        }}
                      />
                    ))}
                  </RowList>
                )}
              </Card>
            </div>
          )}
        </div>
        {actions || failed ? (
          <div className="flex flex-col gap-3">
            {failed ? <Banner tone="bad">{errorText(failed)}</Banner> : null}
            {actions}
          </div>
        ) : null}
      </div>
      <AddItemSheet
        open={open?.kind === 'add'}
        listed={new Set(lines.map((line) => line.variantId))}
        onAdd={(added) => {
          setLines((now) => [...now, ...added]);
        }}
        onClose={() => {
          setOpen(null);
        }}
      />
      <ReceiveSheet
        open={open?.kind === 'receive'}
        purchase={saved}
        onClose={() => {
          setOpen(null);
        }}
      />
      <DeliverySheet
        purchase={saved}
        receipt={open?.kind === 'delivery' ? open.receipt : null}
        onClose={() => {
          setOpen(null);
        }}
      />
      <CloseShortSheet
        open={open?.kind === 'close'}
        purchase={saved}
        onClose={() => {
          setOpen(null);
        }}
      />
      <CancelSheet
        open={open?.kind === 'cancel'}
        purchaseId={saved.id}
        onClose={() => {
          setOpen(null);
        }}
      />
      <DeleteDraftSheet
        open={open?.kind === 'delete'}
        busy={remove.isPending}
        onDelete={() => {
          remove.mutate(undefined, {
            onSuccess: () => {
              setOpen(null);
              void navigate({
                to: '/$shop/purchases',
                params: { shop: slug },
                search: { seg: 'drafts' },
              });
            },
          });
        }}
        onClose={() => {
          setOpen(null);
        }}
      />
    </ShellPage>
  );
}

/**
 * One delivery (Part 21's rows): a tick when anything was accepted, a cross when all of it was rejected; what was
 * accepted and rejected in each unit; its day, who took it, and why it was rejected when nothing was accepted.
 */
function DeliveryRow({
  purchase,
  receipt,
  onOpen,
}: {
  purchase: Purchase;
  receipt: PurchaseReceipt;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = usePurchaseWords();
  const { accepted, rejected } = receiptTotals(purchase, receipt);
  const took = accepted.length > 0;
  const reasons = took
    ? []
    : [...new Set(receipt.items.map((line) => line.rejectReason).filter((why) => why !== null))];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
    >
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-[8px] ${took ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
      >
        <Icon name={took ? 'check' : 'x'} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[16px] font-medium">
          {[
            took ? t('dlvAccepted', { amount: words.units(accepted) }) : null,
            rejected.length > 0 ? t('dlvRejected', { amount: words.units(rejected) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="truncate text-[14px] text-fg-muted">
          {[formatDayMonth(receipt.receivedAt), receipt.actor?.name, reasons.join(', ')]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
      <span className="text-neutral-400">
        <Icon name="right" />
      </span>
    </button>
  );
}
