import { Icon } from '@lytronix/ui';

/** The pill above the bottom tabs on phones, at the foot of the page on wider screens. */
export function Toast({ message }: { message: string | null }): React.JSX.Element | null {
  if (message === null) return null;
  return (
    <div
      role="status"
      className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[14px] whitespace-nowrap text-white shadow-lift sm:bottom-6"
    >
      <span className="text-brand-300">
        <Icon name="check" size={16} />
      </span>
      {message}
    </div>
  );
}
