import { createFileRoute } from '@tanstack/react-router';
import { OptionSets } from '@/views/option-sets';

export const Route = createFileRoute('/_console/catalogue/option-sets')({
  component: OptionSets,
});
