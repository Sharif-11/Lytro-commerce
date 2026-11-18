// CCH-10, D9-33: this build's name (its release in a deployment; next.config.ts makes one per build otherwise), written
// into the code at build time. The service worker drops an older build's files by it, and the page cache never hands out
// a page an older build drew, whose script files the new build no longer has.
export const STOREFRONT_BUILD_ID: string = process.env['STOREFRONT_BUILD_ID'] ?? 'dev';
