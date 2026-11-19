import { createFileRoute } from '@tanstack/react-router';
import { OfferView } from '@/views/offers/offer-page';

// OFFERS-PLAN: one offer -- its form while not started, its page while running and once ended.
export const Route = createFileRoute('/$shop/offers_/$offerId')({
  staticData: {
    screen: { hub: 'shop', section: 'offers', title: 'secOffers', back: '/$shop/offers' },
  },
  component: OfferRoute,
});

function OfferRoute(): React.JSX.Element {
  const { offerId } = Route.useParams();
  return <OfferView offerId={offerId} />;
}
