import { createFileRoute } from '@tanstack/react-router';
import { NoticePage } from '@/views/notices/editor-pages';

export const Route = createFileRoute('/_console/notices/$id/')({
  component: NoticePage,
});
