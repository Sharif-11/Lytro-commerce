// Line icons in the mark's own language: 24-unit grid, 2 px round strokes (BRAND-IDENTITY.md §6). Each path
// is drawn once here; sections refer to icons by name so the set stays consistent.
const paths = {
  check: 'M5 12.5 9.5 17 19 7',
  shield: 'M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6l-8-3Z M9 12l2 2 4-4',
  truck:
    'M3 7h11v9H3V7Zm11 3h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  wallet: 'M3 7h16v12H3V7Zm0 0 2-3h12l2 3M15 13h4v2h-4z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  box: 'M12 3 4 7v10l8 4 8-4V7l-8-4Zm-8 4 8 4 8-4M12 11v10',
  users:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.7',
  store: 'M4 10V21h16V10M3 10l2-6h14l2 6H3Zm6 11v-6h6v6',
  phone:
    'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z',
  mail: 'M3 6h18v12H3V6Zm0 0 9 7 9-7',
  message: 'M4 5h16v11H9l-5 4V5Z',
  chevron: 'm6 9 6 6 6-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  lock: 'M6 11h12v10H6V11Zm3 0V7a3 3 0 0 1 6 0v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  database:
    'M12 8c5 0 8-1.3 8-3s-3-3-8-3-8 1.3-8 3 3 3 8 3Zm-8-3v14c0 1.7 3 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3 3 8 3s8-1.3 8-3',
  code: 'm8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16',
  alert: 'M12 3 2 20h20L12 3Zm0 7v4m0 3v1',
  calendar: 'M4 6h16v15H4V6Zm0 5h16M8 3v5m8-5v5',
  tag: 'M3 12V3h9l9 9-9 9-9-9Zm5-5h.01',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7L20 8m0-5v5h-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4',
  sms: 'M4 4h16v12H8l-4 4V4Zm4 4h8M8 11h5',
  x: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  copy: 'M9 9h11v11H9V9Zm-5 7V4h12',
  map: 'M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  sparkle: 'M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5-3 3m-7 7-3 3m0-13 3 3m7 7 3 3',
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={paths[name]} />
    </svg>
  );
}
