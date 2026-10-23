import { createFileRoute } from '@tanstack/react-router';
import { Home } from '@/views/home';

// TENANT-DASHBOARD-DESIGN §7.1: Home, every member's first screen in a shop; its parts follow their permissions.
export const Route = createFileRoute('/$shop/')({
  staticData: { screen: { hub: 'home', title: 'hubHome' } },
  component: Home,
});
