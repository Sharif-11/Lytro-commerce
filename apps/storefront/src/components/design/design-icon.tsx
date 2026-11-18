// STOREFRONT-BUILDER-PLAN: the icons the designed home's sections draw, as the sketch draws them
// (docs/brand/lytro-storefront-builder.html, its `P` table). Static, trusted markup only, never anything a shop typed.
const PATHS = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15z"/><path d="M5 19c3-4 6-7 10-9"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
  truck:
    '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="17.5" r="1.7"/><circle cx="16.5" cy="17.5" r="1.7"/>',
  wallet:
    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2"/><path d="M3 9h18"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
} as const;

export type DesignIconName = keyof typeof PATHS;

/** One of the sketch's icons, sized and stroked by `.sfb .sb-i` (storefront-design.css). */
export function DesignIcon({ name, className }: { name: DesignIconName; className?: string }) {
  return (
    <svg
      className={className ? `sb-i ${className}` : 'sb-i'}
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}
