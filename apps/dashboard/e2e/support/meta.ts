// Facebook and Meta as the server answers it (LND-15 to LND-17, FED-01, FED-05): the prototype's connected shop, and
// the writes the page makes, kept so a read after shows what changed. A pixel ID that is not 5 to 20 digits is refused
// as the server's field check refuses it.

export interface MetaFixture {
  metaPixelId: string | null;
  conversionsApiConnected: boolean;
  feedUrl: string;
  feedMadeAt: string;
}

/** The prototype's `meta`: pixel and token connected, the feed link made on 14 Oct 2026. */
export function drawnMeta(): MetaFixture {
  return {
    metaPixelId: '1234567890123456',
    conversionsApiConnected: true,
    feedUrl: 'https://megh.lytro.app/feeds/meta/a9f27c41d0b8e5f3k1.csv',
    feedMadeAt: '2026-10-14T04:00:00.000Z',
  };
}

/** The prototype's `meta-empty`: nothing connected yet. */
export function emptyMeta(): MetaFixture {
  return { ...drawnMeta(), metaPixelId: null, conversionsApiConnected: false };
}

const view = (meta: MetaFixture): unknown => ({
  metaPixelId: meta.metaPixelId,
  conversionsApiConnected: meta.conversionsApiConnected,
  updatedAt: null,
});

/** GET reads of the page, else undefined. */
export function metaAnswer(path: string, meta: MetaFixture): unknown {
  if (path === '/ad-tracking') return view(meta);
  if (path === '/catalog-feed') return { url: meta.feedUrl, regeneratedAt: meta.feedMadeAt };
  return undefined;
}

/** A write of the page, kept in the fixture: its answer, a refusal, or undefined when the path is not the page's. */
export function metaWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  meta: MetaFixture,
):
  | { data: unknown }
  | { refused: { status: number; code: string; message: string; details: Record<string, unknown> } }
  | undefined {
  if (method === 'PUT' && path === '/ad-tracking') {
    const pixel = body?.metaPixelId;
    if (typeof pixel === 'string' && !/^\d{5,20}$/.test(pixel)) {
      return {
        refused: {
          status: 400,
          code: 'validation_error',
          message: 'Check the highlighted fields.',
          details: {
            fields: [{ field: 'metaPixelId', message: 'Use the Pixel ID: 5 to 20 digits.' }],
          },
        },
      };
    }
    meta.metaPixelId = typeof pixel === 'string' ? pixel : null;
    if (body && 'conversionsApiToken' in body) {
      meta.conversionsApiConnected = typeof body.conversionsApiToken === 'string';
    }
    return { data: view(meta) };
  }
  if (method === 'POST' && path === '/catalog-feed/regenerate') {
    meta.feedUrl = 'https://megh.lytro.app/feeds/meta/b3c81e07f2a9d4c6m8.csv';
    meta.feedMadeAt = new Date().toISOString();
    return { data: { url: meta.feedUrl, regeneratedAt: meta.feedMadeAt } };
  }
  return undefined;
}
