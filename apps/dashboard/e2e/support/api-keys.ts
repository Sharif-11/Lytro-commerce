// The shop's API keys as the server answers them (API-01, API-03, API-08): the prototype's three, and the writes the
// page makes, kept so the list read after shows what changed. A website that is not an https origin is refused as the
// server's field check refuses it.

export interface KeyFixture {
  id: string;
  name: string;
  type: 'public';
  prefix: string;
  websites: string[];
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** The key the prototype's `sh-key-created` shows, once. */
export const CREATED_KEY = 'lytro_pk_7f2kq9z1m3xd21pvq8rt5zkcw1ne7bhs';

const HOUR_MS = 60 * 60 * 1000;

/** The prototype's `api-keys`: Website and Mobile app live, Old site revoked. */
export function drawnKeys(): KeyFixture[] {
  return [
    {
      id: 'k-website',
      name: 'Website',
      type: 'public',
      prefix: 'lytro_pk_7f2k',
      websites: ['https://meghfashion.com'],
      expiresAt: null,
      createdAt: '2026-10-01T04:00:00.000Z',
      lastUsedAt: '2026-10-21T08:00:00.000Z',
      revokedAt: null,
    },
    {
      id: 'k-app',
      name: 'Mobile app',
      type: 'public',
      prefix: 'lytro_pk_a81m',
      websites: ['https://app.meghfashion.com'],
      expiresAt: '2026-12-31T17:59:59.000Z',
      createdAt: '2026-10-05T04:00:00.000Z',
      lastUsedAt: new Date(Date.now() - 2 * HOUR_MS).toISOString(),
      revokedAt: null,
    },
    {
      id: 'k-old',
      name: 'Old site',
      type: 'public',
      prefix: 'lytro_pk_09ds',
      websites: ['https://old.meghfashion.com'],
      expiresAt: null,
      createdAt: '2026-08-01T04:00:00.000Z',
      lastUsedAt: '2026-09-14T08:00:00.000Z',
      revokedAt: '2026-09-20T08:00:00.000Z',
    },
  ];
}

/** A refusal in the server's shape: its code, its words and the fields it is about. */
export interface KeyRefusal {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

function websitesRefused(websites: unknown): KeyRefusal | null {
  const list = Array.isArray(websites) ? (websites as unknown[]) : [];
  const bad = list.findIndex((each) => typeof each !== 'string' || !each.startsWith('https://'));
  if (list.length > 0 && bad === -1) return null;
  return {
    status: 400,
    code: 'validation_error',
    message: 'Check the highlighted fields.',
    details: {
      fields: [
        {
          field: list.length === 0 ? 'websites' : `websites.${String(bad)}`,
          message: 'Use the address only, starting with https://, with no path after it.',
        },
      ],
    },
  };
}

/** A key write, kept in the fixture: its answer, a refusal, or undefined when the path is not one of the keys'. */
export function keysWrite(
  method: string,
  path: string,
  body: Record<string, unknown> | null,
  keys: KeyFixture[],
): { data: unknown } | { refused: KeyRefusal } | undefined {
  if (method === 'POST' && path === '/api-keys') {
    const refused = websitesRefused(body?.websites);
    if (refused) return { refused };
    const key: KeyFixture = {
      id: `k-${String(keys.length + 1)}`,
      name: typeof body?.name === 'string' ? body.name : '',
      type: 'public',
      prefix: CREATED_KEY.slice(0, 13),
      websites: body?.websites as string[],
      expiresAt:
        typeof body?.expiresAt === 'string' ? new Date(body.expiresAt).toISOString() : null,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    keys.unshift(key);
    return { data: { ...key, key: CREATED_KEY } };
  }
  const one = /^\/api-keys\/([^/]+)(\/revoke)?$/.exec(path);
  const key = one ? keys.find((each) => each.id === one[1]) : undefined;
  if (!one || !key) return undefined;
  if (method === 'POST' && one[2]) {
    key.revokedAt = new Date().toISOString();
    return { data: key };
  }
  if (method === 'PATCH') {
    if (body && 'websites' in body) {
      const refused = websitesRefused(body.websites);
      if (refused) return { refused };
      key.websites = body.websites as string[];
    }
    if (typeof body?.name === 'string') key.name = body.name;
    return { data: key };
  }
  return undefined;
}
