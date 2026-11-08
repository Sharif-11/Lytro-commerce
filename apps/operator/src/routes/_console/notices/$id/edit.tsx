import { createFileRoute } from '@tanstack/react-router';
import { EditNotice } from '@/views/notices/editor-pages';

export const Route = createFileRoute('/_console/notices/$id/edit')({
  component: EditNotice,
});
