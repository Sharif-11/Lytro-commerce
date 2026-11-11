import { createFileRoute } from '@tanstack/react-router';
import { MediaCosts } from '@/views/media-costs';

export const Route = createFileRoute('/_console/media-costs')({
  component: MediaCosts,
});
