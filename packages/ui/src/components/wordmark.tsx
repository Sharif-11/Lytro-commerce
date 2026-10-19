// The Lytro mark and wordmark (BRAND-IDENTITY §3): the mark stands in for the L, followed by "ytro". The
// construction rule is docs/brand/lytro-wordmark.svg (viewBox 142×64, mark scaled 0.72, text at x=46).
const MARK_PATH = 'M15 15V49H31L49 29';

export function Mark({
  size = 28,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <path
        d={MARK_PATH}
        fill="none"
        stroke={color}
        strokeWidth={10}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({
  height = 26,
  tone = 'dark',
}: {
  height?: number;
  tone?: 'dark' | 'light';
}): React.JSX.Element {
  const mark = tone === 'dark' ? '#0e6b66' : '#ffffff';
  const text = tone === 'dark' ? '#10201f' : '#ffffff';
  return (
    <svg
      viewBox="0 0 142 64"
      width={Math.round((height * 142) / 64)}
      height={height}
      role="img"
      aria-label="Lytro"
    >
      <g transform="translate(2.8 8.12) scale(0.72)">
        <path
          d={MARK_PATH}
          fill="none"
          stroke={mark}
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
        fill={text}
        style={{ fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}
      >
        ytro
      </text>
    </svg>
  );
}

/** TEN-18: the small persistent mark every shop's dashboard carries. */
export function PoweredByLytro({ tone = 'dark' }: { tone?: 'dark' | 'light' }): React.JSX.Element {
  const text = tone === 'dark' ? 'text-neutral-700' : 'text-white/70';
  const mark = tone === 'dark' ? '#0e6b66' : '#7fdcd3';
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] font-semibold ${text}`}>
      Powered by <Mark size={14} color={mark} />
      <span className={`wordmark-text ${tone === 'dark' ? 'text-ink' : 'text-white'}`}>ytro</span>
    </span>
  );
}
