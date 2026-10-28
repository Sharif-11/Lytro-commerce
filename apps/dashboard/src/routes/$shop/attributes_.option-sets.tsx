import { createFileRoute } from '@tanstack/react-router';
import { OptionSetsView } from '@/views/attributes/option-sets';

// The Option sets half of Attributes: a sibling route, not a child, keeping the hub's section chips as the prototype's
// `option-sets` draws them.
export const Route = createFileRoute('/$shop/attributes_/option-sets')({
  staticData: { screen: { hub: 'shop', section: 'attributes', title: 'optionSets' } },
  component: OptionSetsView,
});
