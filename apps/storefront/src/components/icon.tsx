import type { CSSProperties } from 'react';
import { ICONS, type IconName } from '@/lib/ui/icons';

// The prototype's icons as inline SVG, one element each (no wrapper), so the stylesheet's `svg.i` rules apply as drawn.
// The markup is the prototype's own static strings, never anything a shop or shopper typed.
const SVG = /^<svg([^>]*)>([\s\S]*)<\/svg>$/;

function parts(name: IconName): { viewBox: string; label: string | null; inner: string } {
  const match = SVG.exec(ICONS[name]);
  const attributes = match?.[1] ?? '';
  return {
    viewBox: /viewBox="([^"]*)"/.exec(attributes)?.[1] ?? '0 0 24 24',
    label: /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? null,
    inner: match?.[2] ?? '',
  };
}

export function Icon({ name, style }: { name: IconName; style?: CSSProperties }) {
  const { viewBox, label, inner } = parts(name);
  return label ? (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  ) : (
    <svg
      className="i"
      viewBox={viewBox}
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
