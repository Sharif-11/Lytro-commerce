import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Resolved relative to this file, so it works from both src/ (tests) and dist/ (built output).
export const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', 'drizzle');

/**
 * The first migration the runner's and CI's checks hold to (Phase 9 Slice 9.7, ENGINEERING-STANDARDS §5). The ones
 * before ran under drizzle's own runner and stay as they are: four were edited after they ran in development (0021,
 * 0029, 0062, 0067), and 0039 to 0043 carry times earlier than 0038's.
 */
export const FIRST_CHECKED_MIGRATION = 135;

/** A file whose statements can't run inside a transaction (`CREATE INDEX CONCURRENTLY`) says so on a line of its own. */
export const OUTSIDE_TRANSACTION_MARKER = '-- outside-transaction';

/** The planned contract of an earlier expand names that migration: `-- contract-of: 0140_orders_new_total`. */
const CONTRACT_MARKER = /^--\s*contract-of:\s*(\S+)\s*$/m;

/** A file that changes rows of Lytro's own small settings tables (control.*) says why: `-- reference-data: ...`. */
const REFERENCE_DATA_MARKER = /^--\s*reference-data:\s*\S/m;

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

/** One migration as the journal lists it and its file holds it. */
export interface MigrationFile {
  tag: string;
  /** The number its name starts with: 135 for 0135_ad_tracking_credential_uses. */
  number: number;
  /** The journal's time for it, which the database records as created_at. */
  when: number;
  /** The file's text with every line ending made \n: what is hashed and run. */
  text: string;
  /** What the runner records: the text's SHA-256. */
  hash: string;
  /**
   * Every hash an earlier run may have recorded for this same file. drizzle's own runner hashed the file as checked out,
   * so a Windows checkout's \r\n line endings gave another hash for the same migration.
   */
  recordedAs: readonly string[];
  /** The parts between drizzle-kit's breakpoints that hold anything to run. */
  statements: readonly string[];
  outsideTransaction: boolean;
  /** The earlier migration this one is the planned contract of, when it says so. */
  contractOf: string | null;
  referenceData: boolean;
}

interface JournalEntry {
  when: number;
  tag: string;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/** Every migration in the journal's order, read from the folder drizzle-kit writes. */
export function readMigrationFiles(folder: string = MIGRATIONS_FOLDER): MigrationFile[] {
  const journal = JSON.parse(readFileSync(path.join(folder, 'meta', '_journal.json'), 'utf8')) as {
    entries: JournalEntry[];
  };
  return journal.entries.map((entry) =>
    migrationOf(entry.tag, entry.when, readFileSync(path.join(folder, `${entry.tag}.sql`), 'utf8')),
  );
}

export function migrationOf(tag: string, when: number, raw: string): MigrationFile {
  const text = raw.replace(/\r\n/g, '\n');
  return {
    tag,
    number: Number.parseInt(tag.slice(0, 4), 10),
    when,
    text,
    hash: sha256(text),
    recordedAs: [sha256(text), sha256(raw), sha256(text.replace(/\n/g, '\r\n'))],
    statements: text.split(STATEMENT_BREAKPOINT).filter((part) => statementsOf(part).length > 0),
    outsideTransaction: text.split('\n').some((line) => line.trim() === OUTSIDE_TRANSACTION_MARKER),
    contractOf: CONTRACT_MARKER.exec(text)?.[1] ?? null,
    referenceData: REFERENCE_DATA_MARKER.test(text),
  };
}

/**
 * Why the checked migrations are out of order, if they are: each must be numbered one after the migration before it,
 * and its time must be later than every migration's before it. drizzle picks what to run by time alone, so a migration
 * merged second with an earlier time would be skipped on a database that already ran the other.
 */
export function orderProblems(
  files: readonly MigrationFile[],
  firstChecked: number = FIRST_CHECKED_MIGRATION,
): string[] {
  const problems: string[] = [];
  let latestWhen = 0;
  let lastNumber = Number.NaN;
  for (const file of files) {
    if (file.number >= firstChecked) {
      if (file.when <= latestWhen) {
        problems.push(
          `${file.tag}: its time (${String(file.when)}) is not after every migration before it; regenerate it so it comes last`,
        );
      }
      if (!Number.isNaN(lastNumber) && file.number !== lastNumber + 1) {
        problems.push(`${file.tag}: numbered ${String(file.number)} after ${String(lastNumber)}`);
      }
    }
    latestWhen = Math.max(latestWhen, file.when);
    lastNumber = file.number;
  }
  return problems;
}

/**
 * The statements some SQL runs, one per entry with its whitespace collapsed: comments and quoted text blanked, a
 * function's body blanked (it runs later, if ever), and a DO block's body opened up (it runs now). Identifiers in double
 * quotes are kept. For reading what a migration does, never for running it.
 */
export function statementsOf(sql: string): string[] {
  return blanked(sql)
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .map(withoutBlockWords)
    .filter((statement) => statement.length > 0);
}

// PL/pgSQL's own words around a DO block's statements: BEGIN ... EXCEPTION WHEN x THEN null; END IF; END.
const BLOCK_WORDS =
  /^(?:BEGIN|DECLARE|ELSE|END IF|END LOOP|END|EXCEPTION WHEN \w+ THEN(?: null)?|(?:IF|ELSIF) .*? THEN)(?:\s+|$)/i;

function withoutBlockWords(statement: string): string {
  let rest = statement;
  for (let match = BLOCK_WORDS.exec(rest); match; match = BLOCK_WORDS.exec(rest)) {
    rest = rest.slice(match[0].length);
    if (/^null$/i.test(rest)) return '';
  }
  return /^null$/i.test(rest) ? '' : rest;
}

function blanked(sql: string): string {
  let out = '';
  let index = 0;
  while (index < sql.length) {
    const char = sql.charAt(index);
    const next = sql.charAt(index + 1);
    if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index);
      index = end === -1 ? sql.length : end;
      out += ' ';
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      out += ' ';
    } else if (char === "'") {
      let end = index + 1;
      while (end < sql.length && !(sql.charAt(end) === "'" && sql.charAt(end + 1) !== "'")) {
        end += sql.charAt(end) === "'" ? 2 : 1;
      }
      out += "''";
      index = end + 1;
    } else if (char === '"') {
      const end = sql.indexOf('"', index + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(index, stop);
      index = stop;
    } else {
      const dollar = char === '$' ? /^\$(\w*)\$/.exec(sql.slice(index)) : null;
      if (dollar) {
        const tag = dollar[0];
        const end = sql.indexOf(tag, index + tag.length);
        const stop = end === -1 ? sql.length : end;
        const body = sql.slice(index + tag.length, stop);
        if (/\bDO\s*$/i.test(out)) {
          out = `${out.replace(/\bDO\s*$/i, '')} ; ${blanked(body)} ; `;
        } else {
          out += " '' ";
        }
        index = end === -1 ? sql.length : end + tag.length;
      } else {
        out += char;
        index += 1;
      }
    }
  }
  return out;
}
