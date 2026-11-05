import { createFileRoute } from '@tanstack/react-router';
import { Shop } from '@/views/shop';

export const Route = createFileRoute('/_console/shops/$id/')({
  component: Shop,
});
