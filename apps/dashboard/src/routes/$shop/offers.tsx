import { createFileRoute } from '@tanstack/react-router';
import { OffersView } from '@/views/offers';

// OFFERS-PLAN (OF-13): the Shop hub's Offers, right after Products.
export const Route = createFileRoute('/$shop/offers')({
  staticData: { screen: { hub: 'shop', section: 'offers', title: 'secOffers' } },
  component: OffersView,
});
