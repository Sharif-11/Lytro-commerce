// LEG-01, LEG-02 (Slice 9.8): the small Markdown the terms and the privacy policy are written in, read into blocks the
// page lays out. Only what the texts use: `#` the title; the header lines (`**ভার্সন:** …`); `##` numbered sections, which
// the section index lists; `###` subheadings; paragraphs with `**bold**`; a wholly bold paragraph as a sub-label; a
// `**সহজ কথায়:**` / `**Plainly:**` line as a section's plain summary; other `**Label:** value` lines as fields; `- `
// bullets; paragraphs numbered "১." or "1."; tables; `---`. Text only: nothing in a file can become HTML.

/** A piece of a line: plain or bold. */
export interface Run {
  text: string;
  bold: boolean;
}

export interface Field {
  label: string;
  value: string;
}

export type LegalBlock =
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'label'; text: string }
  | { kind: 'field'; field: Field }
  | { kind: 'subheading'; text: string }
  | { kind: 'list'; items: Run[][] }
  | { kind: 'numbered'; items: { number: string; runs: Run[] }[] }
  | { kind: 'table'; head: Run[][]; rows: Run[][][] }
  | { kind: 'rule' };

export interface LegalSection {
  /** The number as the heading writes it, "১" or "1". */
  number: string;
  title: string;
  /** The plain summary, without its label. */
  plainly: Run[] | null;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  /** The header lines: version, the day it takes effect, who provides the service. */
  fields: Field[];
  /** The version the header names, in Western digits (`2026-11-20`). */
  version: string;
  intro: LegalBlock[];
  sections: LegalSection[];
}

const PLAINLY_LABELS = ['সহজ কথায়', 'Plainly'];
const FIELD = /^\*\*([^*]+?):\*\*\s+(.+)$/;
const WHOLLY_BOLD = /^\*\*([^*]+)\*\*$/;
const NUMBERED = /^([০-৯]+|\d+)\.\s+(.+)$/;
const SECTION = /^##\s+(?:([০-৯]+|\d+)\.\s+)?(.+)$/;
const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Western digits for Bangla ones, so "২০২৬-১১-২০" names the same version as its file. */
export function westernDigits(text: string): string {
  return text.replace(/[০-৯]/g, (digit) => String(BANGLA_DIGITS.indexOf(digit)));
}

/** A line's bold and plain pieces. */
export function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > at) runs.push({ text: text.slice(at, start), bold: false });
    runs.push({ text: match[1] ?? '', bold: true });
    at = start + match[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), bold: false });
  return runs;
}

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** The file's paragraphs: runs of lines between blank lines, each line without its trailing hard-break spaces. */
function paragraphsOf(markdown: string): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      if (current.length > 0) out.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

function blockOf(lines: string[], where: string): LegalBlock {
  const first = lines[0] ?? '';
  if (first.startsWith('### ')) return { kind: 'subheading', text: first.slice(4).trim() };
  if (/^-{3,}$/.test(first.trim())) return { kind: 'rule' };
  if (lines.every((line) => line.startsWith('- '))) {
    return { kind: 'list', items: lines.map((line) => runsOf(line.slice(2).trim())) };
  }
  if (first.trim().startsWith('|')) {
    const [head, divider, ...rows] = lines;
    if (head === undefined || divider === undefined || !/^\|?[\s:|-]+\|?$/.test(divider.trim())) {
      throw new Error(`${where}: a table needs a header row and a divider row`);
    }
    return {
      kind: 'table',
      head: cellsOf(head).map(runsOf),
      rows: rows.map((row) => cellsOf(row).map(runsOf)),
    };
  }
  const text = lines.join(' ');
  const numbered = NUMBERED.exec(text);
  if (numbered && lines.length === 1) {
    return {
      kind: 'numbered',
      items: [{ number: numbered[1] ?? '', runs: runsOf(numbered[2] ?? '') }],
    };
  }
  const field = FIELD.exec(text);
  if (field && lines.length === 1) {
    return { kind: 'field', field: { label: field[1] ?? '', value: field[2] ?? '' } };
  }
  const bold = WHOLLY_BOLD.exec(text);
  if (bold) return { kind: 'label', text: bold[1] ?? '' };
  return { kind: 'paragraph', runs: runsOf(text) };
}

/** Adds a block, joining a numbered paragraph to the numbered paragraphs just before it. */
function push(blocks: LegalBlock[], block: LegalBlock): void {
  const last = blocks[blocks.length - 1];
  if (block.kind === 'numbered' && last?.kind === 'numbered') {
    last.items.push(...block.items);
    return;
  }
  blocks.push(block);
}

/** Reads one language's text of a version. `name` labels errors only. */
export function parseLegalMarkdown(markdown: string, name: string): LegalDocument {
  const paragraphs = paragraphsOf(markdown);
  const titleLine = paragraphs.shift()?.[0] ?? '';
  if (!titleLine.startsWith('# ')) throw new Error(`${name}: the first line must be the # title`);
  const header = paragraphs.shift() ?? [];
  const fields = header.map((line) => {
    const match = FIELD.exec(line);
    if (!match) throw new Error(`${name}: the header line "${line}" is not **label:** value`);
    return { label: match[1] ?? '', value: match[2] ?? '' };
  });
  const version = westernDigits(fields[0]?.value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) {
    throw new Error(`${name}: the first header line must name the version as a date`);
  }

  const intro: LegalBlock[] = [];
  const sections: LegalSection[] = [];
  for (const lines of paragraphs) {
    const first = lines[0] ?? '';
    const heading = first.startsWith('## ') ? SECTION.exec(first) : null;
    if (heading) {
      sections.push({
        number: heading[1] ?? String(sections.length + 1),
        title: (heading[2] ?? '').trim(),
        plainly: null,
        blocks: [],
      });
      continue;
    }
    if (first.startsWith('# ')) throw new Error(`${name}: a second # title`);
    const section = sections[sections.length - 1];
    const block = blockOf(lines, name);
    if (
      section &&
      block.kind === 'field' &&
      PLAINLY_LABELS.includes(block.field.label) &&
      section.blocks.length === 0 &&
      section.plainly === null
    ) {
      section.plainly = runsOf(block.field.value);
      continue;
    }
    push(section ? section.blocks : intro, block);
  }
  return { title: titleLine.slice(2).trim(), fields, version, intro, sections };
}
