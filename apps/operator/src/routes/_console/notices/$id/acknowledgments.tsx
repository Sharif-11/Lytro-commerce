import { createFileRoute } from '@tanstack/react-router';
import { NoticeAcknowledgmentsPage } from '@/views/notices/acknowledgments';

export const Route = createFileRoute('/_console/notices/$id/acknowledgments')({
  component: NoticeAcknowledgmentsPage,
});
