import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  OFFER_NAME_MAX_LENGTH,
  OFFER_PERCENT_MAX,
  OfferCutKind,
  type OfferCut,
} from '@lytronix/validators';
import { useCreateOffer, useOfferPreview, useOfferStep, useUpdateOffer } from '@/api/offers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { Offer, OfferPick } from '@/types/offers';
import { productCount, removePick } from './offer-picks';
import { OfferRows } from './offer-rows';
import { PickSheet } from './pick-sheet';

/** The amount typed, as the request sends it; 0 for nothing yet. */
function amountOf(typed: string): number {
  const value = Number(typed);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** OF-2: how much off -- % or ৳, then the amount, with the rounding rule under it. */
export function CutFields({
  kind,
  amount,
  error,
  onKind,
  onAmount,
}: {
  kind: OfferCutKind;
  amount: string;
  error?: string;
  onKind: (kind: OfferCutKind) => void;
  onAmount: (amount: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const percent = kind === OfferCutKind.Percent;
  return (
    <>
      <ChipRow role="group">
        <Chip
          on={percent}
          onClick={() => {
            onKind(OfferCutKind.Percent);
          }}
        >
          {t('of.percentChip')}
        </Chip>
        <Chip
          on={!percent}
          onClick={() => {
            onKind(OfferCutKind.Taka);
          }}
        >
          {t('of.takaChip')}
        </Chip>
      </ChipRow>
      <Field
        label={percent ? t('of.percentField') : t('of.takaField')}
        value={amount}
        inputMode="numeric"
        prefix={percent ? undefined : '৳'}
        suffix={percent ? <span className="font-semibold text-fg-muted">%</span> : undefined}
        max={percent ? OFFER_PERCENT_MAX : undefined}
        error={error}
        help={t('of.cutHelp')}
        onChange={(event) => {
          onAmount(event.target.value.replace(/[^\d]/g, ''));
        }}
      />
    </>
  );
}

/**
 * A new offer, or one made ready and not started (OFFERS-PLAN OF-1, OF-2, OF-14; the sketch's `of-new` and `of-bad`):
 * its name, how much off, its products with each one's price now struck through over its offer price, and then Start
 * offer, or Start later to keep it ready. A cut that takes a product below ৳1 marks it and says which, and Start waits
 * until it is fixed (OF-18).
 */
export function OfferForm({ offer }: { offer: Offer | null }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const navigate = useNavigate();
  const { slug, showToast } = useShell();
  const [name, setName] = useState(offer?.name ?? '');
  const [kind, setKind] = useState<OfferCutKind>(offer?.cut.kind ?? OfferCutKind.Percent);
  const [amount, setAmount] = useState(offer ? String(offer.cut.amount) : '20');
  const [picks, setPicks] = useState<OfferPick[]>(
    offer?.items.map((item) => ({ productId: item.productId, designId: item.designId })) ?? [],
  );
  const [picking, setPicking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cut: OfferCut = { kind, amount: amountOf(amount) };
  const preview = useOfferPreview({ cut, items: picks, offerId: offer?.id ?? null });
  const create = useCreateOffer();
  const update = useUpdateOffer(offer?.id ?? '');
  const start = useOfferStep(offer?.id ?? '', 'start');
  const items = preview.data?.items ?? [];
  const low = items.filter((item) => item.belowOne);
  const held = items.filter((item) => item.heldBy !== null);
  const ready = name.trim() !== '' && cut.amount > 0 && picks.length > 0;
  const busy = create.isPending || update.isPending || start.isPending;
  const failed = create.error ?? update.error ?? start.error;

  const save = (now: boolean) => {
    const body = { name: name.trim(), cut, items: picks };
    const done = (saved: Offer) => {
      showToast(t(now ? 'of.started_toast' : 'of.saved_toast'));
      void navigate({
        to: '/$shop/offers/$offerId',
        params: { shop: slug, offerId: saved.id },
        replace: offer === null,
      });
    };
    if (offer === null) {
      create.mutate({ ...body, start: now }, { onSuccess: done });
      return;
    }
    update.mutate(body, {
      onSuccess: (saved) => {
        if (now) start.mutate(undefined, { onSuccess: done });
        else done(saved);
      },
    });
  };

  return (
    <ShellPage title={offer?.name ?? t('of.newOffer')} titleInHeader={offer !== null}>
      {failed ? <ErrorBanner error={failed} /> : null}
      {low.length > 0 ? (
        <Banner tone="bad">
          {t('of.tooBigBanner', {
            names: [...new Set(low.map((item) => item.name))].join(', '),
          })}
        </Banner>
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card>
            <Field
              label={t('of.name')}
              value={name}
              maxLength={OFFER_NAME_MAX_LENGTH}
              help={t('of.nameHelp')}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Card>
          <Card>
            <div className="flex flex-col gap-3">
              <h3 className="text-[17px] font-semibold">{t('of.howMuch')}</h3>
              <CutFields kind={kind} amount={amount} onKind={setKind} onAmount={setAmount} />
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold">
              {t('of.productsHead', { count: productCount(picks) })}
            </h2>
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
          </div>
          {picks.length === 0 ? (
            <Card>
              <EmptyState icon="tag">{t('of.noneYet')}</EmptyState>
            </Card>
          ) : preview.isError ? (
            <ErrorBanner error={preview.error} />
          ) : (
            <Card flush>
              <OfferRows
                items={items}
                showAll={showAll}
                onShowAll={() => {
                  setShowAll(true);
                }}
                onRemove={(gone) => {
                  setPicks((now) =>
                    gone.reduce(
                      (left, item) =>
                        removePick(left, { productId: item.productId, designId: item.designId }),
                      now,
                    ),
                  );
                }}
              />
            </Card>
          )}
        </div>
      </div>
      <PickSheet
        open={picking}
        offerId={offer?.id ?? null}
        picked={picks}
        onClose={() => {
          setPicking(false);
        }}
        onDone={(next) => {
          setPicks(next);
          setPicking(false);
        }}
      />
      <ActionBar atEnd>
        <Button
          tone="outline"
          disabled={!ready || busy}
          onClick={() => {
            save(false);
          }}
        >
          {offer ? t('of.save') : t('of.startLater')}
        </Button>
        <Button
          busy={busy}
          disabled={!ready || low.length > 0 || held.length > 0}
          onClick={() => {
            save(true);
          }}
        >
          {t('of.start')}
        </Button>
      </ActionBar>
    </ShellPage>
  );
}
