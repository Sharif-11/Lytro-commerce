import { createFileRoute } from '@tanstack/react-router';
import { ManualEntries } from '@/views/manual';

export const Route = createFileRoute('/_console/manual')({
  component: ManualEntries,
});
