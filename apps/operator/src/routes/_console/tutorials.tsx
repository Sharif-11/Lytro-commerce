import { createFileRoute } from '@tanstack/react-router';
import { Tutorials } from '@/views/tutorials';

// OPERATOR-CONSOLE-DESIGN §10h: the tutorial videos in every seller's app.
export const Route = createFileRoute('/_console/tutorials')({
  component: Tutorials,
});
