/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_PLATFORM_DOMAIN?: string;
  readonly VITE_SITE_URL?: string;
  /** The support WhatsApp number in international form without "+" (8801XXXXXXXXX), the website's SUPPORT_WHATSAPP. */
  readonly VITE_SUPPORT_WHATSAPP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
