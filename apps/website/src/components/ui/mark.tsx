// The Lytro mark: an open L whose arm turns into a rising stroke (BRAND-IDENTITY.md §3). One path, drawn
// at every size from the same geometry; `draw` plays the one-time draw-in animation the hero uses.
export function Mark({
  size = 32,
  color = 'currentColor',
  draw = false,
  className,
}: {
  size?: number;
  color?: string;
  draw?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={[draw ? 'draw-mark' : '', className ?? ''].join(' ').trim() || undefined}
    >
      <path
        d="M15 15V49H31L49 29"
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
