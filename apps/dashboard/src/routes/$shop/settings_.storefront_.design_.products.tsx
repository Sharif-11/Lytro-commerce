import { createFileRoute } from '@tanstack/react-router';
import { ProductListView } from '@/views/design/product-list-page';

// The design's Product list (STOREFRONT-BUILDER-PLAN DC-6 to DC-8): the shop's cards in its default order, moved by
// the seller; its back arrow to the design page.
export const Route = createFileRoute('/$shop/settings_/storefront_/design_/products')({
  staticData: {
    screen: {
      hub: 'menu',
      section: 'settings',
      title: 'sProductList',
      back: '/$shop/settings/storefront/design',
    },
  },
  component: ProductListView,
});
