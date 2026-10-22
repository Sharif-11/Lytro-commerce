import { createFileRoute } from '@tanstack/react-router';
import { Arriving } from '@/views/arriving';

// Built in its own pull request of Slice 11; until then the hub's navigation reaches it and says so.
export const Route = createFileRoute('/$shop/attributes')({
  staticData: { screen: { hub: 'shop', section: 'attributes', title: 'secAttributes' } },
  component: () => <Arriving icon="layers" />,
});
