import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { Arriving } from '@/views/arriving';

// TENANT-DASHBOARD-DESIGN §7.25: Add-ons, below Usage. ?buy=<key> opens an add-on's Buy sheet and ?pack=bandwidth or
// ?pack=requests the pack sheet (agreed for Slice 11.5c); the screen itself comes in the next commit.
export const Route = createFileRoute('/$shop/addons')({
  validateSearch: z.object({
    buy: z.string().optional().catch(undefined),
    pack: z.enum(['bandwidth', 'requests']).optional().catch(undefined),
  }),
  staticData: {
    screen: { hub: 'money', section: 'usage', title: 'aoTitle', back: '/$shop/usage' },
  },
  component: () => <Arriving icon="trend" />,
});
