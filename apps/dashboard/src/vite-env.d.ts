/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_PLATFORM_DOMAIN?: string;
  readonly VITE_SITE_URL?: string;
  // OBS-03 (Slice 9.6): Sentry's address for this build, and the commit it's built from.
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
