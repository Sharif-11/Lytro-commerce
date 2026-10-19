// Line icons in the mark's own language: 24-unit grid, 2 px round strokes (BRAND-IDENTITY §6). The same
// set the marketing site draws, so both apps read as one product.
const paths = {
  check: 'M5 12.5 9.5 17 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  back: 'M19 12H5m6 6-6-6 6-6',
  chevron: 'm6 9 6 6 6-6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z',
  orders: 'M5 4h14v16H5V4Zm3 5h8M8 13h8M8 17h5',
  box: 'M12 3 4 7v10l8 4 8-4V7l-8-4Zm-8 4 8 4 8-4M12 11v10',
  users:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.7',
  wallet: 'M3 7h16v12H3V7Zm0 0 2-3h12l2 3M15 13h4v2h-4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Zm4 4h4',
  phone:
    'M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2Z',
  lock: 'M6 11h12v10H6V11Zm3 0V7a3 3 0 0 1 6 0v4',
  store: 'M4 10V21h16V10M3 10l2-6h14l2 6H3Zm6 11v-6h6v6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h11v11H9V9Zm-5 7V4h12',
  share: 'M4 12v8h16v-8M12 16V3m-4 4 4-4 4 4',
  truck:
    'M3 7h11v9H3V7Zm11 3h4l3 3v3h-7v-6ZM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  tag: 'M3 12V3h9l9 9-9 9-9-9Zm5-5h.01',
  image: 'M4 5h16v14H4V5Zm4 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm-4 7 5-5 4 4 3-3 4 4',
  sms: 'M4 4h16v12H8l-4 4V4Zm4 4h8M8 11h5',
  key: 'M14 10a4 4 0 1 0-3.5 4L4 20.5V22h3v-2h2v-2h2l1.5-1.5A4 4 0 0 0 14 10Zm1-1h.01',
  signal: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L14.8 3H9.2l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h5.6l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z',
  logout: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  calendar: 'M4 6h16v15H4V6Zm0 5h16M8 3v5m8-5v5',
  shield: 'M12 3 4 6v6c0 4.5 3.4 7.8 8 9 4.6-1.2 8-4.5 8-9V6l-8-3Z M9 12l2 2 4-4',
  alert: 'M12 3 2 20h20L12 3Zm0 7v4m0 3v1',
  map: 'M12 21s6-5.5 6-11a6 6 0 1 0-12 0c0 5.5 6 11 6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  pen: 'M4 20h4l10-10-4-4L4 16v4Zm10-14 4 4',
  plus: 'M12 5v14M5 12h14',
  facebook: 'M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8Z',
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
}): React.JSX.Element {
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
