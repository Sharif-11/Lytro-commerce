/** A marigold count on a navigation item: how much is waiting there. Nothing when nothing is. */
export function CountBadge({
  count,
  className,
}: {
  count: number;
  className: string;
}): React.JSX.Element | null {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-accent font-bold text-ink ${className}`}
    >
      {count}
    </span>
  );
}
