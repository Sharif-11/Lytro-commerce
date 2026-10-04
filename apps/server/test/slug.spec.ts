import { describe, expect, it } from 'vitest';
import { SlugService, type SlugAvailability } from '../src/tenancy/services/slug.service';
import { SlugFormat } from '../src/tenancy/services/slug-format';
import { SLUG_MAX_LENGTH } from '@lytronix/validators';

const format = new SlugFormat();

function slugsWith(availability: SlugAvailability): SlugService {
  return new SlugService(availability, format);
}

describe('suggestBase (AUTH-11)', () => {
  it('turns the Latin letters of a name into a slug', () => {
    expect(format.suggestBase('Fashion House')).toBe('fashion-house');
    expect(format.suggestBase('  --Shop!! 24  ')).toBe('shop-24');
  });

  it('folds accents so the address stays plain', () => {
    expect(format.suggestBase("Côte d'Azur Café")).toBe('cote-d-azur-cafe');
  });

  it('returns null when the name has no Latin letter', () => {
    expect(format.suggestBase('ফ্যাশন হাউস')).toBeNull();
    expect(format.suggestBase('12345')).toBeNull();
    expect(format.suggestBase('   ')).toBeNull();
  });

  it('returns null when what remains is too short to be an address', () => {
    expect(format.suggestBase('A')).toBeNull();
    expect(format.suggestBase('ab')).toBeNull();
    expect(format.suggestBase('a b')).toBe('a-b');
  });

  it('cuts long names at a word boundary and never past 30 characters', () => {
    // Cut at the last hyphen inside 30 characters, so the result is short of the limit but never splits a word.
    expect(format.suggestBase('The Very Long Fashion Boutique And Accessories Store')).toBe(
      'the-very-long-fashion',
    );
  });
});

describe('suffix candidates (AUTH-11)', () => {
  it('adds numeric suffixes in order', () => {
    expect(format.suffixCandidates('fashion-house').slice(0, 2)).toEqual([
      'fashion-house-2',
      'fashion-house-3',
    ]);
  });

  it('keeps the suffixed address within 30 characters', () => {
    const base = 'a'.repeat(SLUG_MAX_LENGTH);
    for (const candidate of format.suffixCandidates(base)) {
      expect(candidate.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    }
  });

  it('strips an existing numeric suffix before re-suggesting', () => {
    expect(format.stripNumericSuffix('fashion-house-2')).toBe('fashion-house');
    expect(format.stripNumericSuffix('fashion-house')).toBe('fashion-house');
  });
});

function fakeAvailability(unavailable: string[]): SlugAvailability {
  const set = new Set(unavailable);
  return {
    findUnavailable: (slugs) => Promise.resolve(new Set(slugs.filter((slug) => set.has(slug)))),
  };
}

describe('SlugService.suggest (AUTH-11)', () => {
  it('suggests the base when it is free', async () => {
    const service = slugsWith(fakeAvailability([]));
    expect(await service.suggest('Fashion House')).toBe('fashion-house');
  });

  it('suggests the next free suffix when the base is taken', async () => {
    const service = slugsWith(fakeAvailability(['fashion-house']));
    expect(await service.suggest('Fashion House')).toBe('fashion-house-2');
  });

  it('gives "admin-2" for a shop named Admin, since admin is reserved', async () => {
    const service = slugsWith(fakeAvailability(['admin']));
    expect(await service.suggest('Admin')).toBe('admin-2');
  });

  it('returns null for a name with no Latin letters', async () => {
    const service = slugsWith(fakeAvailability([]));
    expect(await service.suggest('ফ্যাশন হাউস')).toBeNull();
  });
});

describe('SlugService.checkAddress (AUTH-11)', () => {
  it('accepts a valid, free address', async () => {
    const service = slugsWith(fakeAvailability([]));
    expect(await service.checkAddress('my-shop')).toEqual({ ok: true, address: 'my-shop' });
  });

  it('refuses a malformed address without asking the database', async () => {
    const calls: string[][] = [];
    const service = slugsWith({
      findUnavailable: (slugs) => {
        calls.push(slugs);
        return Promise.resolve(new Set());
      },
    });
    expect(await service.checkAddress('Bad_Shop')).toEqual({
      ok: false,
      reason: 'format',
      suggestion: null,
    });
    expect(calls).toHaveLength(0);
  });

  it('refuses a taken address and offers the next free one', async () => {
    const service = slugsWith(fakeAvailability(['fashion-house', 'fashion-house-2']));
    expect(await service.checkAddress('fashion-house')).toEqual({
      ok: false,
      reason: 'unavailable',
      suggestion: 'fashion-house-3',
    });
  });

  it('refuses a reserved address, such as www', async () => {
    const service = slugsWith(fakeAvailability(['www']));
    expect(await service.checkAddress('www')).toEqual({
      ok: false,
      reason: 'unavailable',
      suggestion: 'www-2',
    });
  });

  it('does not stack suffixes when the owner retypes a suggested address', async () => {
    const service = slugsWith(fakeAvailability(['fashion-house', 'fashion-house-2']));
    expect(await service.checkAddress('fashion-house-2')).toEqual({
      ok: false,
      reason: 'unavailable',
      suggestion: 'fashion-house-3',
    });
  });
});
