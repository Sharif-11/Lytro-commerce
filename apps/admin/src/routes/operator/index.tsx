import { createFileRoute } from '@tanstack/react-router';
import { OperatorConsole } from '@/views/operator/console';

export const Route = createFileRoute('/operator/')({
  component: OperatorConsole,
});
