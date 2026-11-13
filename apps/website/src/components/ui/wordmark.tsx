// The wordmark: the mark stands in for the L, followed by "ytro" (BRAND-IDENTITY.md §3.2). The construction
// rule is the symbol in docs/brand/lytro-wordmark.svg (viewBox 142×64, mark scaled 0.72, text at x=46).
export function Wordmark({
  height = 28,
  tone = 'dark',
  className,
}: {
  height?: number;
  /** `css` takes the colours from the `--wm-mark-c` and `--wm-text-c` custom properties (site.css `.wm`), so a bar
      that changes colour as the page scrolls recolours the wordmark with it. */
  tone?: 'dark' | 'light' | 'css';
  className?: string;
}) {
  const colour =
    tone === 'css' ? 'var(--wm-mark-c, #0e6b66)' : tone === 'dark' ? '#0e6b66' : '#ffffff';
  const text =
    tone === 'css' ? 'var(--wm-text-c, #10201f)' : tone === 'dark' ? '#10201f' : '#ffffff';
  const width = Math.round((height * 142) / 64);
  return (
    <svg
      viewBox="0 0 142 64"
      width={width}
      height={height}
      role="img"
      aria-label="Lytro"
      className={className}
    >
      <g transform="translate(2.8 8.12) scale(0.72)">
        <path
          d="M15 15V49H31L49 29"
          fill="none"
          style={{ stroke: colour }}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text
        x={46}
        y={47}
        fontSize={42}
        fontWeight={800}
        letterSpacing={-1.3}
        style={{ fill: text, fontFamily: 'var(--font-jakarta), Inter, system-ui, sans-serif' }}
      >
        ytro
      </text>
    </svg>
  );
}
