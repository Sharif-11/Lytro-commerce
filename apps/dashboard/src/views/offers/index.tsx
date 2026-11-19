import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { OfferState, Permission } from '@lytronix/validators';
import { useOffers } from '@/api/offers';
import { ErrorBanner } from '@/components/error-banner';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { RowChevron, RowList, RowText, rowClass } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { OfferSummary } from '@/types/offers';
import { useOfferWords } from './offer-words';

/** OF-14: the list's groups, in its order. */
const GROUPS: readonly [OfferState, string][] = [
  [OfferState.Running, 'of.running'],
  [OfferState.Waiting, 'of.waiting'],
  [OfferState.Ended, 'of.endedHead'],
];

/**
 * Shop › Offers (OFFERS-PLAN; the sketch's `of-list` and `of-empty`): the shop's offers by state -- running, not
 * started, ended -- each with its cut, its products and its date; New offer for whoever may change products (OF-24).
 */
export function OffersView(): React.JSX.Element {
  const { t } = useTranslation('shop');
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.ProductsManage]);
  const list = useOffers();
  const words = useOfferWords();
  const offers = list.data?.offers ?? [];

  const make = (withIcon: boolean) =>
    mayManage ? (
      <Link to="/$shop/offers/new" params={{ shop: slug }} className={buttonClass('primary', 'sm')}>
        {withIcon ? <Icon name="plus" /> : null}
        {t('of.newOffer')}
      </Link>
    ) : null;

  const row = (offer: OfferSummary) => {
    const [tone, label] = words.state(offer.state);
    const ended = offer.state === OfferState.Ended;
    return (
      <Link
        key={offer.id}
        to="/$shop/offers/$offerId"
        params={{ shop: slug, offerId: offer.id }}
        className={rowClass}
      >
        <span
          className={`flex size-10 flex-none items-center justify-center rounded-button ${ended ? 'bg-neutral-100 text-neutral-700' : 'bg-accent-soft text-accent-text'}`}
        >
          <Icon name="tag" />
        </span>
        <RowText
          title={
            <>
              {offer.name} <StatusTag tone={tone}>{label}</StatusTag>
            </>
          }
          sub={words.line(offer)}
        />
        <RowChevron />
      </Link>
    );
  };

  return (
    <ShellPage actions={make(true)}>
      {list.isError ? <ErrorBanner error={list.error} /> : null}
      {list.isPending ? (
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      ) : offers.length === 0 ? (
        <Card>
          <EmptyState icon="tag" action={make(false) ?? undefined}>
            {t('of.empty')}
          </EmptyState>
        </Card>
      ) : (
        GROUPS.map(([state, heading]) => {
          const these = offers.filter((offer) => offer.state === state);
          if (these.length === 0) return null;
          return (
            <section key={state} className="flex flex-col gap-2">
              <h2 className="text-[17px] font-semibold">{t(heading)}</h2>
              <Card flush>
                <RowList>{these.map(row)}</RowList>
              </Card>
            </section>
          );
        })
      )}
    </ShellPage>
  );
}
