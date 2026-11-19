import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { OfferCutKind, OfferState, Permission } from '@lytronix/validators';
import { useDeleteOffer, useOffer, useOfferStep, useUpdateOffer } from '@/api/offers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { Dialog } from '@/components/ui/dialog';
import { Kv } from '@/components/ui/kv';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useShopAddress } from '@/hooks/use-shop-address';
import { formatShortDay } from '@/lib/dates';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { Offer, OfferPick } from '@/types/offers';
import { CutFields, OfferForm } from './offer-form';
import { productCount, removePick } from './offer-picks';
import { OfferRows } from './offer-rows';
import { useOfferWords } from './offer-words';
import { PickSheet } from './pick-sheet';

/** OF-15 (the sketch's `of-change`): a running offer's new cut, its prices changed at once. */
function ChangeSheet({
  offer,
  open,
  onClose,
}: {
  offer: Offer;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('shop');
  const update = useUpdateOffer(offer.id);
  const [kind, setKind] = useState<OfferCutKind>(offer.cut.kind);
  const [amount, setAmount] = useState(String(offer.cut.amount));

  useEffect(() => {
    if (!open) return;
    setKind(offer.cut.kind);
    setAmount(String(offer.cut.amount));
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = Number(amount);
  return (
    <Sheet
      open={open}
      title={t('of.changeTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={update.isPending}
          disabled={!Number.isInteger(value) || value < 1}
          onClick={() => {
            update.mutate({ cut: { kind, amount: value } }, { onSuccess: onClose });
          }}
        >
          {t('of.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {update.isError ? <ErrorBanner error={update.error} /> : null}
        <CutFields kind={kind} amount={amount} onKind={setKind} onAmount={setAmount} />
        <p className="text-[14px] text-fg-muted">{t('of.changeHelp')}</p>
      </div>
    </Sheet>
  );
}

/**
 * One offer (OFFERS-PLAN; the sketch's `of-offer`, `of-end`, `of-ended`). One not started opens as its form. A running
 * one shows its cut (Change), when it started, its link to share, and its products, added or taken out live (OF-15);
 * End offer asks first and puts every price back (OF-3, OF-20). An ended one shows its products at their prices now,
 * with Run it again (a copy, not started) and Delete (OF-14).
 */
export function OfferView({ offerId }: { offerId: string }): React.JSX.Element {
  const { t, i18n } = useTranslation('shop');
  const navigate = useNavigate();
  const { slug, viewer, showToast } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const read = useOffer(offerId);
  const words = useOfferWords();
  const { host } = useShopAddress();
  const update = useUpdateOffer(offerId);
  const end = useOfferStep(offerId, 'end');
  const copy = useOfferStep(offerId, 'copy');
  const remove = useDeleteOffer(offerId);
  const [picking, setPicking] = useState(false);
  const [changing, setChanging] = useState(false);
  const [asking, setAsking] = useState<'end' | 'delete' | null>(null);
  const [showAll, setShowAll] = useState(false);
  const offer = read.data;

  if (read.isError) {
    return (
      <ShellPage>
        <ErrorBanner error={read.error} />
      </ShellPage>
    );
  }
  if (!offer) {
    return (
      <ShellPage>
        <Card flush>
          <SkeletonRows count={4} />
        </Card>
      </ShellPage>
    );
  }
  if (offer.state === OfferState.Waiting) return <OfferForm offer={offer} />;

  const running = offer.state === OfferState.Running;
  const [tone, label] = words.state(offer.state);
  const picks: OfferPick[] = offer.items.map((item) => ({
    productId: item.productId,
    designId: item.designId,
  }));
  // OF-21: the shop's own domain when it has one, else its Lytro address.
  const link = `${host}/offers/${offer.slug}`;
  const failed = update.error ?? end.error ?? copy.error ?? remove.error;

  return (
    <ShellPage
      title={offer.name}
      titleInHeader
      actions={<StatusTag tone={tone}>{label}</StatusTag>}
    >
      {failed ? <ErrorBanner error={failed} /> : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card>
            <Kv
              label={t('of.discount')}
              value={
                <span className="flex items-center gap-2">
                  {words.cut(offer.cut)}
                  {running && mayManage ? (
                    <button
                      type="button"
                      className="font-semibold text-primary"
                      onClick={() => {
                        setChanging(true);
                      }}
                    >
                      {t('of.change')}
                    </button>
                  ) : null}
                </span>
              }
            />
            {offer.startedAt ? (
              <Kv label={t('of.started')} value={formatShortDay(offer.startedAt, i18n.language)} />
            ) : null}
            {offer.endedAt ? (
              <Kv label={t('of.endedLabel')} value={formatShortDay(offer.endedAt, i18n.language)} />
            ) : null}
            <Kv
              label={t('of.productsLabel')}
              value={[
                t('of.products', { count: offer.products }),
                offer.designs > 0 ? t('of.designsN', { count: offer.designs }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </Card>
          <Card>
            <div className="flex flex-col gap-2">
              <h3 className="text-[17px] font-semibold">{t('of.link')}</h3>
              <div className="flex items-start gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="num text-[15px] font-medium break-all">{link}</span>
                  <span className="text-[14px] text-fg-muted">
                    {running ? t('of.linkHelp') : t('of.linkEnded')}
                  </span>
                </span>
                <CopyButton text={`https://${link}`} size="xs" icon />
              </div>
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">
              {running
                ? t('of.productsHead', { count: productCount(picks) })
                : t('of.endedProducts', { count: productCount(picks) })}
            </h2>
            {running && mayManage ? (
              <button
                type="button"
                className="flex items-center gap-1 font-semibold text-primary"
                onClick={() => {
                  setPicking(true);
                }}
              >
                <Icon name="plus" size={18} />
                {t('of.pick')}
              </button>
            ) : null}
          </div>
          {running ? <p className="-mt-1.5 text-[14px] text-fg-muted">{t('of.liveNote')}</p> : null}
          <Card flush>
            <OfferRows
              items={offer.items}
              ended={!running}
              showAll={showAll}
              onShowAll={() => {
                setShowAll(true);
              }}
              onRemove={
                running && mayManage && productCount(picks) > 1
                  ? (gone) => {
                      update.mutate({
                        items: gone.reduce(
                          (left, item) =>
                            removePick(left, {
                              productId: item.productId,
                              designId: item.designId,
                            }),
                          picks,
                        ),
                      });
                    }
                  : undefined
              }
            />
          </Card>
        </div>
      </div>
      {mayManage ? (
        <ActionBar atEnd>
          {running ? (
            <Button
              tone="outline"
              onClick={() => {
                setAsking('end');
              }}
            >
              <span className="text-danger-text">{t('of.end')}</span>
            </Button>
          ) : (
            <>
              <Button
                tone="outline"
                onClick={() => {
                  setAsking('delete');
                }}
              >
                <span className="text-danger-text">{t('of.delete')}</span>
              </Button>
              <Button
                busy={copy.isPending}
                onClick={() => {
                  copy.mutate(undefined, {
                    onSuccess: (made) => {
                      showToast(t('of.copied_toast'));
                      void navigate({
                        to: '/$shop/offers/$offerId',
                        params: { shop: slug, offerId: made.id },
                      });
                    },
                  });
                }}
              >
                {t('of.runAgain')}
              </Button>
            </>
          )}
        </ActionBar>
      ) : null}
      {running ? (
        <>
          <ChangeSheet
            offer={offer}
            open={changing}
            onClose={() => {
              setChanging(false);
            }}
          />
          <PickSheet
            open={picking}
            offerId={offer.id}
            picked={picks}
            onClose={() => {
              setPicking(false);
            }}
            onDone={(next) => {
              setPicking(false);
              if (next.length > 0) update.mutate({ items: next });
            }}
          />
        </>
      ) : null}
      <Dialog
        open={asking === 'end'}
        title={t('of.endTitle', { name: offer.name })}
        onClose={() => {
          setAsking(null);
        }}
        actions={
          <>
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                setAsking(null);
              }}
            >
              {t('of.keepRunning')}
            </Button>
            <Button
              tone="danger"
              size="sm"
              busy={end.isPending}
              onClick={() => {
                end.mutate(undefined, {
                  onSuccess: () => {
                    setAsking(null);
                    showToast(t('of.ended_toast'));
                  },
                });
              }}
            >
              {t('of.end')}
            </Button>
          </>
        }
      >
        {t('of.endBody', { count: offer.products })}
      </Dialog>
      <Dialog
        open={asking === 'delete'}
        title={t('of.deleteTitle', { name: offer.name })}
        onClose={() => {
          setAsking(null);
        }}
        actions={
          <>
            <Button
              tone="outline"
              size="sm"
              onClick={() => {
                setAsking(null);
              }}
            >
              {t('of.cancel')}
            </Button>
            <Button
              tone="danger"
              size="sm"
              busy={remove.isPending}
              onClick={() => {
                remove.mutate(undefined, {
                  onSuccess: () => {
                    showToast(t('of.deleted_toast'));
                    void navigate({ to: '/$shop/offers', params: { shop: slug } });
                  },
                });
              }}
            >
              {t('of.delete')}
            </Button>
          </>
        }
      >
        {t('of.deleteBody')}
      </Dialog>
    </ShellPage>
  );
}
