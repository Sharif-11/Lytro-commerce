import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PUBLISHED_PRIVACY_VERSIONS, PUBLISHED_TERMS_VERSIONS } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { dhakaToday } from '@/lib/legal/legal-dates';
import { LegalLibrary, type LegalKind, legalLibrary } from '@/lib/legal/legal-library';
import {
  type LegalBlock,
  type LegalDocument,
  parseLegalMarkdown,
  westernDigits,
} from '@/lib/legal/legal-markdown';

const PUBLISHED: Record<LegalKind, readonly string[]> = {
  terms: PUBLISHED_TERMS_VERSIONS,
  privacy: PUBLISHED_PRIVACY_VERSIONS,
};
const KINDS = ['terms', 'privacy'] as const;

function contentFiles(kind: LegalKind): string[] {
  const folder = fileURLToPath(new URL(`../src/content/legal/${kind}/`, import.meta.url));
  return readdirSync(folder).sort();
}

function load(kind: LegalKind, version: string, language: 'bn' | 'en'): LegalDocument {
  const document = legalLibrary.find(kind, version, language);
  if (!document) throw new Error(`no ${kind} ${version} ${language}`);
  return document;
}

/** A block's shape without its words: what must match between the Bangla and its English translation. */
function shapeOf(block: LegalBlock): string {
  switch (block.kind) {
    case 'list':
      return `list:${String(block.items.length)}`;
    case 'numbered':
      return `numbered:${String(block.items.length)}`;
    case 'table':
      return `table:${String(block.head.length)}x${block.rows.map((row) => row.length).join(',')}`;
    case 'field':
    case 'label':
    case 'paragraph':
    case 'subheading':
    case 'rule':
      return block.kind;
  }
}

function structureOf(document: LegalDocument) {
  return {
    fields: document.fields.length,
    intro: document.intro.map(shapeOf),
    sections: document.sections.map((section) => ({
      number: westernDigits(section.number),
      plainly: section.plainly !== null,
      blocks: section.blocks.map(shapeOf),
    })),
  };
}

describe('LEG-01: the published terms and privacy versions and their texts', () => {
  for (const kind of KINDS) {
    it(`${kind}: every published version has its Bangla and English text, and every text is a published version`, () => {
      const expected = PUBLISHED[kind].flatMap((version) => [
        `${version}.bn.md`,
        `${version}.en.md`,
      ]);
      expect(contentFiles(kind)).toEqual(expected.sort());
    });

    it(`${kind}: the version each text's header names is its file's name`, () => {
      for (const version of PUBLISHED[kind]) {
        expect(load(kind, version, 'bn').version).toBe(version);
        expect(load(kind, version, 'en').version).toBe(version);
      }
    });

    it(`${kind}: the English follows the Bangla block for block`, () => {
      for (const version of PUBLISHED[kind]) {
        const bn = load(kind, version, 'bn');
        const en = load(kind, version, 'en');
        expect(structureOf(en)).toEqual(structureOf(bn));
        expect(bn.sections.length).toBeGreaterThan(0);
      }
    });

    it(`${kind}: sections are numbered 1, 2, 3 … in order`, () => {
      for (const version of PUBLISHED[kind]) {
        const numbers = load(kind, version, 'bn').sections.map((section) =>
          Number(westernDigits(section.number)),
        );
        expect(numbers).toEqual(numbers.map((_, index) => index + 1));
      }
    });

    it(`${kind}: both texts say the Bangla prevails`, () => {
      for (const version of PUBLISHED[kind]) {
        const bnText = JSON.stringify(load(kind, version, 'bn'));
        const enText = JSON.stringify(load(kind, version, 'en'));
        expect(bnText).toMatch(/বাংলা (ভার্সন|সংস্করণ) প্রাধান্য পাবে/);
        expect(enText).toContain('the Bangla version prevails');
      }
    });
  }

  it('versions are oldest first and named by a day', () => {
    for (const versions of Object.values(PUBLISHED)) {
      expect([...versions].sort()).toEqual([...versions]);
      for (const version of versions) expect(version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('parseLegalMarkdown', () => {
  const sample = [
    '# Title',
    '',
    '**ভার্সন:** ২০২৬-১১-২০  ',
    '**কার্যকর হবে:** ২০ নভেম্বর ২০২৬',
    '',
    'Intro with **bold**.',
    '',
    '---',
    '',
    '## ১. First',
    '',
    '**সহজ কথায়:** the summary.',
    '',
    '### Sub',
    '',
    '**Days 0–3: grace**',
    '',
    '- one',
    '- two **b**',
    '',
    '১. first point',
    '',
    '২. second point',
    '',
    '| A | B |',
    '|---|---|',
    '| a | b |',
    '',
    '**ইমেইল:** support@lytro.app',
  ].join('\n');

  it('reads the header, the intro, sections and every block kind', () => {
    const document = parseLegalMarkdown(sample, 'sample');
    expect(document.title).toBe('Title');
    expect(document.version).toBe('2026-11-20');
    expect(document.fields).toEqual([
      { label: 'ভার্সন', value: '২০২৬-১১-২০' },
      { label: 'কার্যকর হবে', value: '২০ নভেম্বর ২০২৬' },
    ]);
    expect(document.intro.map((block) => block.kind)).toEqual(['paragraph', 'rule']);
    const [section] = document.sections;
    expect(section?.number).toBe('১');
    expect(section?.title).toBe('First');
    expect(section?.plainly).toEqual([{ text: 'the summary.', bold: false }]);
    expect(section?.blocks.map(shapeOf)).toEqual([
      'subheading',
      'label',
      'list:2',
      'numbered:2',
      'table:2x2',
      'field',
    ]);
    expect(section?.blocks[2]).toEqual({
      kind: 'list',
      items: [
        [{ text: 'one', bold: false }],
        [
          { text: 'two ', bold: false },
          { text: 'b', bold: true },
        ],
      ],
    });
  });

  it('refuses a text without its title or a dated version', () => {
    expect(() => parseLegalMarkdown('no title', 'x')).toThrow();
    expect(() => parseLegalMarkdown('# T\n\n**Version:** v1', 'x')).toThrow();
  });
});

describe('dhakaToday', () => {
  it('is the date in Dhaka, six hours ahead of UTC', () => {
    expect(dhakaToday(new Date('2026-11-19T17:59:00Z'))).toBe('2026-11-19');
    expect(dhakaToday(new Date('2026-11-19T18:00:00Z'))).toBe('2026-11-20');
  });
});

describe('LegalLibrary', () => {
  const text = '# T\n\n**Version:** 2026-11-20\n\n## 1. One\n\nText.';
  const later = '# T\n\n**Version:** 2027-02-01\n\n## 1. One\n\nText.';
  const library = new LegalLibrary(
    {
      terms: {
        '2026-11-20': { bn: text, en: text },
        '2027-02-01': { bn: later, en: later },
      },
      privacy: {},
    },
    { terms: ['2026-11-20', '2027-02-01'], privacy: [] },
  );

  it('takes the version the server names when its text is published', () => {
    expect(library.inForce('terms', '2026-11-20', '2027-03-01')).toBe('2026-11-20');
  });

  it('without the server, or for a name with no text, takes the newest version already in effect', () => {
    expect(library.inForce('terms', null, '2027-01-31')).toBe('2026-11-20');
    expect(library.inForce('terms', null, '2027-02-01')).toBe('2027-02-01');
    expect(library.inForce('terms', '2026-11-04', '2027-02-02')).toBe('2027-02-01');
  });

  it('before the first version takes effect, shows the first', () => {
    expect(library.inForce('terms', null, '2026-11-13')).toBe('2026-11-20');
  });

  it('never shows a version that is not published', () => {
    expect(library.find('terms', '2026-11-04', 'bn')).toBeNull();
    expect(() => library.inForce('privacy', null, '2027-01-01')).toThrow();
  });
});
