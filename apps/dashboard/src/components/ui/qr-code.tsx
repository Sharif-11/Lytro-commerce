import { useMemo } from 'react';
import QRCode from 'qrcode';

// Quiet space around the code, in the code's own squares. Enough for a phone's camera beside a white card.
const MARGIN = 2;

/** The dark squares as one path, so the page holds no image: the dashboard's policy allows no `data:` picture. */
function squaresOf(text: string): { size: number; path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  let path = '';
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) path += `M${String(x)} ${String(y)}h1v1h-1z`;
    }
  }
  return { size: modules.size, path };
}

/** A QR code for `text`, drawn in black on white whatever the shop's theme, so a camera can read it. */
export function QrCode({
  text,
  label,
  size = 176,
}: {
  text: string;
  /** What it holds, in words, for a screen reader. */
  label: string;
  size?: number;
}): React.JSX.Element {
  const code = useMemo(() => squaresOf(text), [text]);
  const whole = code.size + MARGIN * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${String(-MARGIN)} ${String(-MARGIN)} ${String(whole)} ${String(whole)}`}
      shapeRendering="crispEdges"
    >
      <rect x={-MARGIN} y={-MARGIN} width={whole} height={whole} fill="#ffffff" />
      <path d={code.path} fill="#10201f" />
    </svg>
  );
}
