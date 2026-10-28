import { createFileRoute } from '@tanstack/react-router';
import { AttributesView } from '@/views/attributes';

export const Route = createFileRoute('/$shop/attributes')({
  staticData: { screen: { hub: 'shop', section: 'attributes', title: 'secAttributes' } },
  component: AttributesView,
});
