import { createFileRoute } from '@tanstack/react-router';
import { Couriers } from '@/views/couriers';

export const Route = createFileRoute('/_console/couriers/')({
  component: Couriers,
});
