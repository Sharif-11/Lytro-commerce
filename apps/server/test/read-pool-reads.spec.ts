import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// DAT-45's static check (Slice 9.2, D9-13): code marked as a read, which runs on the read pool as the read-only role,
// holds no write statement. The role refuses one at run time; this finds it before anything runs. It follows each
// repository method the read-marked adapter calls, and each of that repository's own methods those call in turn.
const ROOT = path.resolve(__dirname, '..', '..', '..');
const REPOSITORIES = path.join(ROOT, 'packages', 'db', 'src', 'repositories');
// A write, or a row lock, which a read-only transaction refuses as well.
const WRITE =
  /\.(insert|update|delete|for)\(|\b(INSERT\s+INTO|UPDATE\s+[a-z_."]+\s+SET|DELETE\s+FROM|TRUNCATE|FOR\s+(NO\s+KEY\s+)?UPDATE|FOR\s+(KEY\s+)?SHARE)\b/i;

/** Every class marked as a read: its file, and the class whose whole body runs on the read pool. */
const READ_MARKED = [
  {
    file: path.join(ROOT, 'apps/server/src/database/adapters/public-catalogue.adapter.ts'),
    className: 'DrizzlePublicCatalogueStore',
  },
];

/**
 * The text from `start` to the line that closes it. The code is Prettier-formatted, so a class ends at a line that is
 * just `}` and a method at one that is just `  }`; a brace in a parameter's type or a nested block sits deeper.
 */
function blockFrom(source: string, start: number, closingLine: string): string {
  const end = source.indexOf(`\n${closingLine}\n`, start);
  if (end < 0) throw new Error('no closing line');
  return source.slice(start, end + closingLine.length + 1);
}

function classBody(source: string, className: string): string {
  const start = source.search(new RegExp(`export class ${className}\\b`));
  if (start < 0) throw new Error(`class ${className} not found`);
  return blockFrom(source, start, '}');
}

/** A method of a class, at a class member's indentation. */
function methodBody(body: string, name: string): string | null {
  const start = body.search(new RegExp(`\\n {2}(?:async )?${name}(?:<[^\\n]*>)?\\(`));
  return start < 0 ? null : blockFrom(body, start + 1, '  }');
}

function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(folder, entry.name))
      : entry.name.endsWith('.ts')
        ? [path.join(folder, entry.name)]
        : [],
  );
}

// Line endings as Git wrote them on this machine or CI's; the rules above read lines.
const read = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const repositorySources = filesUnder(REPOSITORIES).map(read);

function repositoryClass(className: string): string {
  const source = repositorySources.find((text) =>
    new RegExp(`export class ${className}\\b`).test(text),
  );
  if (source === undefined) throw new Error(`repository ${className} not found`);
  return classBody(source, className);
}

/** Each write a repository method makes, itself or through its class's own methods it calls. */
function writesIn(className: string, method: string, seen = new Set<string>()): string[] {
  const key = `${className}.${method}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const body = methodBody(repositoryClass(className), method);
  if (body === null) return [`${key}: method not found`];
  const own = WRITE.test(body) ? [key] : [];
  const called = [...body.matchAll(/this\.([a-zA-Z]+)\(/g)].map((match) => match[1] ?? '');
  return [...own, ...called.flatMap((name) => writesIn(className, name, seen))];
}

describe("the read pool's code holds no write (DAT-45)", () => {
  for (const marked of READ_MARKED) {
    const body = classBody(read(marked.file), marked.className);
    // The repositories it holds, by constructor parameter: `private readonly catalogue: PublicCatalogueRepository`.
    const fields = new Map(
      [...body.matchAll(/private readonly ([a-zA-Z]+): ([A-Z][a-zA-Z]+Repository)\b/g)].map(
        (match) => [match[1] ?? '', match[2] ?? ''] as const,
      ),
    );
    const calls = [...body.matchAll(/this\.([a-zA-Z]+)\.([a-zA-Z]+)\(/g)]
      .map((match) => ({ field: match[1] ?? '', method: match[2] ?? '' }))
      .filter((call) => fields.has(call.field));

    it(`${marked.className} reads through the read pool only`, () => {
      expect(body).toContain('this.database.reads.db');
      expect(body).not.toContain('database.handle');
    });

    it(`${marked.className} calls no repository method that writes`, () => {
      expect(calls.length).toBeGreaterThan(5);
      const writes = calls.flatMap((call) => writesIn(fields.get(call.field) ?? '', call.method));
      expect(writes).toEqual([]);
    });
  }

  it('would find one: the check catches a write and a row lock', () => {
    expect(writesIn('CategoryRepository', 'insertCategory')).toEqual([
      'CategoryRepository.insertCategory',
    ]);
    expect(writesIn('CategoryRepository', 'lockCategories')).toEqual([
      'CategoryRepository.lockCategories',
    ]);
    expect(writesIn('CategoryRepository', 'listCategories')).toEqual([]);
  });
});
