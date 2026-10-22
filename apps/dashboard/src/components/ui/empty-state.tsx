import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/icon';

interface EmptyStateProps {
  icon: IconName;
  /** One sentence on what will appear here (TENANT-DASHBOARD-DESIGN §9); a bold first line may lead it. */
  children: ReactNode;
  /** The one button that starts it. */
  action?: ReactNode;
}

/** An empty list or a screen still to come (the prototype's `.empty`). */
export function EmptyState({ icon, children, action }: EmptyStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <span className="text-neutral-300 [&_svg]:stroke-[1.25]">
        <Icon name={icon} size={48} />
      </span>
      <p className="max-w-[280px] text-[16px] text-fg-muted [&_b]:font-bold [&_b]:text-fg-muted">
        {children}
      </p>
      {action}
    </div>
  );
}
