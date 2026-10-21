import { describe, expect, it } from 'vitest';
import { LinkVerifier } from '../src/signed-link';
import { SHOP, signedQuery } from './fakes';

const SECRET = 'a-link-secret';
const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const PATH = `/tenants/${SHOP}/private/proof.webp`;

function link(query: string, path = PATH): URL {
  return new URL(`https://media.lytro.test${path}?${query}`);
}

// BND-07, MED-08: a private file only through a link the server signed, before it expires.
describe('signed private links (BND-07)', () => {
  const verifier = new LinkVerifier(SECRET, () => NOW);
  const inFifteen = Math.floor(NOW / 1000) + 15 * 60;

  it('takes a link signed with the shared secret until it expires', async () => {
    expect(await verifier.verify(link(await signedQuery(SECRET, PATH, inFifteen)))).toBe(true);
    const expired = Math.floor(NOW / 1000) - 1;
    expect(await verifier.verify(link(await signedQuery(SECRET, PATH, expired)))).toBe(false);
  });

  it('refuses a link signed for another file, another time, or with another secret', async () => {
    const query = await signedQuery(SECRET, PATH, inFifteen);
    expect(await verifier.verify(link(query, `/tenants/${SHOP}/private/other.webp`))).toBe(false);
    expect(
      await verifier.verify(link(query.replace(String(inFifteen), String(inFifteen + 60)))),
    ).toBe(false);
    expect(await verifier.verify(link(await signedQuery('another', PATH, inFifteen)))).toBe(false);
    expect(await verifier.verify(link('expires=abc&signature=x'))).toBe(false);
    expect(await verifier.verify(link(`expires=${String(inFifteen)}&signature=***`))).toBe(false);
    expect(await verifier.verify(link(''))).toBe(false);
  });
});
