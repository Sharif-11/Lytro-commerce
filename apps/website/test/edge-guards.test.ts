import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// PHASE-9-PLAN 9.10, DEPLOYMENT §9g: what Cloudflare's kept copy of a page relies on, checked in the source. Its cache
// rule ignores the query, so an ad's `?fbclid=` or `?utm_source=` link is the page everyone else gets; a page that read
// its query would hand one visitor's answer to all. A cookie set by a kept page would be handed out the same way. And a
// prefetch goes to the website itself, past the kept copy.

const SRC = join(__dirname, '..', 'src');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = filesUnder(SRC).map((path) => ({
  name: relative(SRC, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

function namesMatching(pattern: RegExp): string[] {
  return files.filter((file) => pattern.test(file.text)).map((file) => file.name);
}

describe('what the edge’s kept pages rely on', () => {
  it('reads the source', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no page or layout reads its query', () => {
    expect(namesMatching(/useSearchParams/)).toEqual([]);
    expect(
      files
        .filter((f) => f.name.startsWith('app/') && /searchParams/.test(f.text))
        .map((f) => f.name),
    ).toEqual([]);
    // The middleware decides by path, method, two headers and the language cookie alone.
    expect(namesMatching(/nextUrl\.search\b|nextUrl\.searchParams/)).toEqual([]);
  });

  it('only the language reader touches the request’s cookies on the server, and it only reads', () => {
    expect(namesMatching(/from 'next\/headers'/)).toEqual(['lib/i18n/read-language.ts']);
    expect(
      namesMatching(
        /cookies\(\)\s*\)?\s*\.(set|delete)\(|\.cookies\.(set|delete)\(|['"]set-cookie['"]/i,
      ),
    ).toEqual([]);
  });

  it('only the site’s own Link imports Next’s, so no link is prefetched', () => {
    expect(namesMatching(/from 'next\/link'/)).toEqual(['components/ui/site-link.tsx']);
  });
});
