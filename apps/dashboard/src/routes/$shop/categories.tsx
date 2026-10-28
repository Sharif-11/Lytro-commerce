import { createFileRoute } from '@tanstack/react-router';
import { CategoriesView } from '@/views/categories';

export const Route = createFileRoute('/$shop/categories')({
  staticData: { screen: { hub: 'shop', section: 'categories', title: 'secCategories' } },
  component: CategoriesView,
});
