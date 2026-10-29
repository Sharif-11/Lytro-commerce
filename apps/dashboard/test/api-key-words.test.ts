import { describe, expect, it } from 'vitest';
import type { ApiKey } from '../src/types/api-key';
import {
  expiryOf,
  keyLine,
  lastUsedOf,
  websitesOf,
  websitesProblem,
} from '../src/views/settings/api-key-words';

// The key and its values, so the wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const NOW = Date.parse('2026-10-27T10:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const KEY: ApiKey = {
  id: 'k-1',
  name: 'Website',
  type: 'public',
  purpose: null,
  prefix: 'lytro_pk_7f2k',
  websites: ['https://meghfashion.com', 'https://www.meghfashion.com'],
  expiresAt: '2026-12-31T17:59:59.000Z',
  createdAt: '2026-10-01T04:00:00.000Z',
  lastUsedAt: '2026-10-21T08:00:00.000Z',
  revokedAt: null,
};

describe('a key’s line', () => {
  it('says when it was last used: just now, hours ago within a day, else the day; or never', () => {
    expect(lastUsedOf(new Date(NOW - 10 * 60 * 1000).toISOString(), t, NOW)).toBe(
      'akLastUsed {"when":"akJustNow"}',
    );
    expect(lastUsedOf(new Date(NOW - 2 * HOUR).toISOString(), t, NOW)).toBe(
      'akLastUsed {"when":"akHours {\\"count\\":2}"}',
    );
    expect(lastUsedOf('2026-10-21T08:00:00.000Z', t, NOW)).toBe('akLastUsed {"when":"21 Oct"}');
    expect(lastUsedOf(null, t, NOW)).toBe('akNever');
  });

  it('gives its first characters, websites, last use and expiry', () => {
    expect(keyLine(KEY, t, NOW)).toBe(
      'lytro_pk_7f2k… · https://meghfashion.com, https://www.meghfashion.com · akLastUsed {"when":"21 Oct"} · akExpires {"date":"31 Dec 2026"}',
    );
    expect(keyLine({ ...KEY, expiresAt: null }, t, NOW)).not.toContain('akExpires');
  });
});

describe('a key’s form', () => {
  it('takes the websites one a line, blank lines left out', () => {
    expect(websitesOf(' https://a.example \n\n https://b.example\n')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(websitesOf('')).toEqual([]);
  });

  it('ends a key on the last moment of its day in Dhaka, or never', () => {
    expect(expiryOf('2026-12-31')).toBe('2026-12-31T23:59:59+06:00');
    expect(expiryOf('')).toBeUndefined();
  });

  it('shows the server’s refusal for any of the website lines under the field', () => {
    expect(websitesProblem({ 'websites.1': 'Use https.' })).toBe('Use https.');
    expect(websitesProblem({ websites: 'Add one.' })).toBe('Add one.');
    expect(websitesProblem({ name: 'Too long.' })).toBeUndefined();
  });
});
