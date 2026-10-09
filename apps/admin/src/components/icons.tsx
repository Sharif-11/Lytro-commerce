interface IconProps {
  className?: string;
}

const DEFAULT_CLASS = 'h-5 w-5';

export function PhoneIcon({ className = DEFAULT_CLASS }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 5a2 2 0 0 1 2-2h2.28a1 1 0 0 1 .98.8l.74 3.7a1 1 0 0 1-.27.9l-1.36 1.36a11.5 11.5 0 0 0 5.4 5.4l1.36-1.36a1 1 0 0 1 .9-.27l3.7.74a1 1 0 0 1 .8.98V19a2 2 0 0 1-2 2h-1C9.6 21 3 14.4 3 6V5Z"
      />
    </svg>
  );
}

export function LockIcon({ className = DEFAULT_CLASS }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function UserIcon({ className = DEFAULT_CLASS }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function ShopIcon({ className = DEFAULT_CLASS }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9.5 5.5 4h13L20 9.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 9.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 20v-5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5"
      />
    </svg>
  );
}

export function LinkIcon({ className = DEFAULT_CLASS }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 14.5 14.5 9.5M8 15.5l-1.6 1.6a3 3 0 0 1-4.3-4.3l2.8-2.8a3 3 0 0 1 4.3 0M16 8.5l1.6-1.6a3 3 0 0 1 4.3 4.3l-2.8 2.8a3 3 0 0 1-4.3 0"
      />
    </svg>
  );
}
