import type { Language } from './mock-api';
import { PRESETS } from './presets';

// The shop's own settings as the server answers them (TEN-16, TEN-19, TEN-30, PST-01, LIF-16), and the writes Settings
// makes, kept so a read after shows what changed. An image is sent to a same-origin path the mock answers, as R2 would.

export interface ImageFixture {
  id: string;
  urls: { main: string; thumbnail: string };
}

export interface SettingsFixture {
  shopName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  businessAddress: string | null;
  businessType: string | null;
  logo: ImageFixture | null;
  /** What the server makes of an uploaded image: ready, or refused with its reason. */
  upload: 'ready' | { refused: string };
}

/** The prototype's `shopdetails`: Megh Fashion, a support phone, no email, its Mirpur address, selling clothing. */
export function drawnSettings(language: Language): SettingsFixture {
  const bn = language === 'bn';
  return {
    shopName: bn ? 'মেঘ ফ্যাশন' : 'Megh Fashion',
    contactPhone: '+8801711234567',
    contactEmail: null,
    businessAddress: bn ? '24/বি, মিরপুর 10, ঢাকা 1216' : '24/B, Mirpur 10, Dhaka 1216',
    businessType: 'clothing',
    logo: null,
    upload: 'ready',
  };
}

// A tiny PNG the logo's thumbnail answers with, so the page draws a real image.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const UPLOAD_PATH = '/__upload/m-logo';

function view(settings: SettingsFixture): unknown {
  return {
    shopName: settings.shopName,
    contactPhone: settings.contactPhone,
    contactEmail: settings.contactEmail,
    businessAddress: settings.businessAddress,
    extraDeliveryChargePerKg: '0.00',
    defaultPaymentPolicy: 'cod',
    defaultAdvanceAmount: null,
    logo: settings.logo,
  };
}

function media(status: string, settings: SettingsFixture): unknown {
  const refused = typeof settings.upload === 'object' ? settings.upload.refused : null;
  return {
    id: 'm-logo',
    kind: 'image',
    status,
    purpose: 'shop_logo',
    width: status === 'ready' ? 512 : null,
    height: status === 'ready' ? 512 : null,
    durationMs: null,
    bytes: status === 'ready' ? 2048 : 0,
    urls: status === 'ready' ? { main: PIXEL, thumbnail: PIXEL } : null,
    failure: status === 'failed' ? refused : null,
    createdAt: new Date().toISOString(),
  };
}

/** GET reads of Settings, else undefined. */
export function settingsAnswer(path: string, settings: SettingsFixture): unknown {
  if (path === '/shop-settings') return view(settings);
  if (path === '/product-defaults') return { businessType: settings.businessType };
  if (path === '/presets') {
    return PRESETS.map(([key, labelBn, labelEn]) => ({ key, labelBn, labelEn, defaults: {} }));
  }
  if (path === '/media/m-logo') {
    return media(typeof settings.upload === 'object' ? 'failed' : 'ready', settings);
  }
  return undefined;
}

/** A Settings write, kept in the fixture, or undefined when the path is not one of Settings'. */
export function settingsWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  settings: SettingsFixture,
): { data: unknown } | undefined {
  if (method === 'PATCH' && path === '/shop-settings') {
    if (typeof body?.shopName === 'string') settings.shopName = body.shopName;
    for (const key of ['contactPhone', 'contactEmail', 'businessAddress'] as const) {
      if (body && key in body) settings[key] = typeof body[key] === 'string' ? body[key] : null;
    }
    return { data: view(settings) };
  }
  if (method === 'PUT' && path === '/business-type') {
    settings.businessType = typeof body?.businessType === 'string' ? body.businessType : null;
    return { data: {} };
  }
  if (method === 'POST' && path === '/media/uploads') {
    return {
      data: {
        media: media('uploading', settings),
        upload: {
          url: UPLOAD_PATH,
          method: 'PUT',
          headers: {
            'content-type': typeof body?.contentType === 'string' ? body.contentType : '',
          },
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      },
    };
  }
  if (method === 'POST' && path === '/media/m-logo/finish') {
    return { data: media('processing', settings) };
  }
  if (method === 'PUT' && path === '/shop-settings/logo') {
    settings.logo =
      typeof body?.mediaId === 'string'
        ? { id: body.mediaId, urls: { main: PIXEL, thumbnail: PIXEL } }
        : null;
    return { data: view(settings) };
  }
  return undefined;
}

/** The prototype's `exports`: one being made, one ready (18 MB), one failed; requested at its drawn Dhaka times. */
export function drawnExports(): unknown[] {
  const row = (id: string, status: string, requestedAt: string, bytes: number | null) => ({
    id,
    tenantId: 'tenant-1',
    status,
    fileSizeBytes: bytes,
    contentType: bytes === null ? null : 'application/zip',
    failureReason: status === 'failed' ? 'export_failed' : null,
    requestedAt,
    readyAt: status === 'ready' ? requestedAt : null,
    expiresAt: status === 'ready' ? new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString() : null,
  });
  return [
    row('export-3', 'pending', '2026-10-20T05:50:00.000Z', null),
    row('export-2', 'ready', '2026-10-12T03:14:00.000Z', 18 * 1024 * 1024),
    row('export-1', 'failed', '2026-09-30T16:03:00.000Z', null),
  ];
}
