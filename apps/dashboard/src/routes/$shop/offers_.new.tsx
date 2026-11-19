import { createFileRoute } from '@tanstack/react-router';
import { OfferForm } from '@/views/offers/offer-form';

// OFFERS-PLAN (OF-1, OF-14): a new offer, started at once or kept for later.
export const Route = createFileRoute('/$shop/offers_/new')({
  staticData: {
    screen: {
      hub: 'shop',
      section: 'offers',
      title: 'secOffers',
      deskTitle: 'shop:of.newOffer',
      back: '/$shop/offers',
    },
  },
  component: () => <OfferForm offer={null} />,
});
