import { createFileRoute } from '@tanstack/react-router';
import { Phones } from '@/views/phones';

export const Route = createFileRoute('/_console/phones/')({
  component: Phones,
});
