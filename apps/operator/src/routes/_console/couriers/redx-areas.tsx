import { createFileRoute } from '@tanstack/react-router';
import { RedxAreas } from '@/views/couriers/redx-areas';

export const Route = createFileRoute('/_console/couriers/redx-areas')({
  component: RedxAreas,
});
