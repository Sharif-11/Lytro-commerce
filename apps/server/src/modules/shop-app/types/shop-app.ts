/** TEN-17: the icons an installed shop app is given -- Android's two and its maskable one, and the iPhone's. */
export enum ShopIconFile {
  Icon192 = 'icon-192.png',
  Icon512 = 'icon-512.png',
  Maskable512 = 'maskable-512.png',
  Apple180 = 'apple-180.png',
}

/** TEN-17: a shop's web app manifest, as a browser reads it to install the shop's dashboard as its own app. */
export interface ShopManifest {
  id: string;
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  lang: 'bn';
  theme_color: string;
  background_color: string;
  icons: { src: string; sizes: string; type: 'image/png'; purpose: 'any' | 'maskable' }[];
}
