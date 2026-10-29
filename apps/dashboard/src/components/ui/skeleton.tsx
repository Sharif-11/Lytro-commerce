import { useTranslation } from 'react-i18next';

/**
 * TENANT-DASHBOARD-DESIGN §9: a list loading, as rows in its own shape -- the 40 px square and the two lines of a
 * row -- so nothing jumps when the rows arrive. The prototype draws no loading state; this is that rule drawn.
 */
export function SkeletonRows({ count = 3 }: { count?: number }): React.JSX.Element {
  const { t } = useTranslation('shell');
  return (
    <div
      role="status"
      aria-label={t('loading')}
      className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex min-h-16 items-center gap-3 px-4 py-3">
          <span className="size-10 flex-none animate-pulse rounded-button bg-neutral-100" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3.5 w-2/5 animate-pulse rounded-full bg-neutral-100" />
            <span className="h-3 w-1/4 animate-pulse rounded-full bg-neutral-100" />
          </span>
        </div>
      ))}
    </div>
  );
}
