// Google's "G" and Facebook's "f", each in its own official colours, as each provider's sign-in branding
// rules require (docs/brand/third-party/README.md).
export function GoogleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 48 48" width={20} height={20} aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.5l6.8-6.8C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17Z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.5 42.6 14.6 48 24 48Z"
      />
    </svg>
  );
}

export function FacebookIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#0866FF" />
      <path
        fill="#fff"
        d="M15.9 15.5l.5-3.5h-3.3V9.8c0-1 .5-1.9 2-1.9h1.5V5c-.9-.1-1.8-.2-2.7-.2-2.8 0-4.6 1.7-4.6 4.7V12H6.3v3.5h3V24a12 12 0 0 0 3.8 0v-8.5h2.8Z"
      />
    </svg>
  );
}
