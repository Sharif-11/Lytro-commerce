import { createFileRoute } from '@tanstack/react-router';
import { SectionEmpty } from '@/views/sections/section-empty';

export const Route = createFileRoute('/$shop/products')({
  component: () => <SectionEmpty section="products" />,
});
