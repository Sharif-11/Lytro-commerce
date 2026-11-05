import { createFileRoute } from '@tanstack/react-router';
import { Attributes } from '@/views/attributes';

export const Route = createFileRoute('/_console/catalogue/attributes')({
  component: Attributes,
});
