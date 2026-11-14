import { statementsOf, type MigrationFile } from './migration-files';

/** What the release before this one shipped, as the check compares a contract step with it. */
export interface PreviousRelease {
  /** The migrations it had. */
  tags: ReadonlySet<string>;
  /** Its schema's tables ("tenant.orders") and each one's columns, from its newest drizzle-kit snapshot. */
  tables: ReadonlyMap<string, ReadonlySet<string>>;
}

const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][\w$]*)`;
const QUALIFIED = String.raw`(${NAME}(?:\s*\.\s*${NAME})?)`;
const ALTER_TABLE = new RegExp(String.raw`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?${QUALIFIED}`, 'i');
const CREATE_TABLE = new RegExp(
  String.raw`^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?${QUALIFIED}`,
  'i',
);
const CREATE_INDEX = new RegExp(
  String.raw`^CREATE (?:UNIQUE )?INDEX\b.*?\bON (?:ONLY )?${QUALIFIED}`,
  'i',
);
const DROP_TABLE = new RegExp(String.raw`^DROP TABLE (?:IF EXISTS )?${QUALIFIED}`, 'i');
const UPDATE = new RegExp(String.raw`^UPDATE (?:ONLY )?${QUALIFIED}`, 'i');
const DELETE = new RegExp(String.raw`^DELETE FROM (?:ONLY )?${QUALIFIED}`, 'i');
const TRUNCATE = new RegExp(String.raw`^TRUNCATE (?:TABLE )?(?:ONLY )?${QUALIFIED}`, 'i');
const INSERT = new RegExp(String.raw`^INSERT INTO ${QUALIFIED}`, 'i');
const DROP_COLUMN = new RegExp(String.raw`\bDROP (?:COLUMN )?(?:IF EXISTS )?(${NAME})`, 'gi');
const RENAME_COLUMN = new RegExp(String.raw`\bRENAME (?:COLUMN )?(${NAME}) TO\b`, 'i');
// A default PostgreSQL works out row by row rewrites the whole table under its lock; a stable one (now()) doesn't.
const VOLATILE_DEFAULT =
  /\bDEFAULT\s*\(?\s*(?:gen_random_uuid|uuid_generate_v\d|random|clock_timestamp|timeofday|nextval)\s*\(/i;
const SERIAL_TYPE = /\bADD COLUMN (?:IF NOT EXISTS )?\S+ (?:small|big)?serial\b/i;
const ONE_AT_A_TIME =
  /^(?:CREATE (?:UNIQUE )?INDEX CONCURRENTLY IF NOT EXISTS|DROP INDEX CONCURRENTLY IF EXISTS|REINDEX .*\bCONCURRENTLY\b)/i;

/** "tenant"."orders" and tenant.orders alike, as tenant.orders. */
function tableName(raw: string): string {
  return raw
    .split('.')
    .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
    .join('.');
}

const columnName = (raw: string): string => raw.replace(/^"|"$/g, '').toLowerCase();

interface Finding {
  message: string;
  /** Allowed in a step marked as the planned contract of an earlier expand. */
  contract: boolean;
}

/**
 * Why a new migration would break the release running beside it or before it, if it would (ENGINEERING-STANDARDS §5,
 * Phase 9 Slice 9.7): a deploy runs the old and new code side by side on the new schema, and a rollback runs the old
 * code on it. A table the same file creates is new and empty, so nothing locks or breaks on it. `previous` is the
 * release before this one, which a contract step's drops are confirmed against; without it they are taken as marked.
 */
export function migrationProblems(file: MigrationFile, previous: PreviousRelease | null): string[] {
  const statements = statementsOf(file.text);
  const created = new Set(
    statements.flatMap((statement) => {
      const match = CREATE_TABLE.exec(statement);
      return match?.[1] ? [tableName(match[1])] : [];
    }),
  );
  const findings: Finding[] = [];
  const add = (message: string, contract = false): void => {
    findings.push({ message, contract });
  };

  if (file.outsideTransaction) {
    for (const part of file.statements) {
      const inPart = statementsOf(part);
      if (inPart.length !== 1 || !ONE_AT_A_TIME.test(inPart[0] ?? '')) {
        add(
          `runs outside a transaction, so each part between breakpoints must be one CREATE INDEX CONCURRENTLY IF NOT EXISTS or DROP INDEX CONCURRENTLY IF EXISTS, which can run again: "${inPart.join('; ').slice(0, 80)}"`,
        );
      }
    }
  }

  const validated = new Set<string>();
  for (const statement of statements) {
    const short = statement.slice(0, 100);
    if (/\bCONCURRENTLY\b/i.test(statement) && !file.outsideTransaction) {
      add(
        `"${short}" can't run inside a transaction: put it in its own file marked -- outside-transaction`,
      );
    }

    const alter = ALTER_TABLE.exec(statement);
    const index = CREATE_INDEX.exec(statement);
    const target = alter?.[1] ?? index?.[1];
    const table = target ? tableName(target) : null;
    const existing = table !== null && !created.has(table);

    if (alter && table && existing) {
      for (const match of statement.matchAll(DROP_COLUMN)) {
        const word = (match[1] ?? '').toUpperCase();
        // DROP CONSTRAINT, DROP DEFAULT, DROP NOT NULL, DROP IDENTITY and DROP EXPRESSION loosen a rule, never break a reader.
        if (['CONSTRAINT', 'DEFAULT', 'NOT', 'IDENTITY', 'EXPRESSION'].includes(word)) continue;
        const column = columnName(match[1] ?? '');
        add(`drops ${table}.${column}`, true);
        if (previous?.tables.get(table)?.has(column)) {
          add(
            `drops ${table}.${column}, which the previous release's schema still has: stop reading and writing it, and take it out of the schema, a release first`,
          );
        }
      }
      const renamed = RENAME_COLUMN.exec(statement);
      if (renamed && !/\bRENAME CONSTRAINT\b/i.test(statement)) {
        const column = columnName(renamed[1] ?? '');
        add(
          `renames ${table}.${column}: keep the column's name and rename the field in the code instead`,
          true,
        );
        if (previous?.tables.get(table)?.has(column)) {
          add(`renames ${table}.${column}, which the previous release's schema still has`);
        }
      }
      if (
        / RENAME TO /i.test(` ${statement} `) &&
        !renamed &&
        !/\bRENAME CONSTRAINT\b/i.test(statement)
      ) {
        add(`renames the table ${table}`, true);
        if (previous?.tables.has(table))
          add(`renames ${table}, which the previous release's schema still has`);
      }
      if (/\bALTER (?:COLUMN )?\S+ (?:SET DATA )?TYPE\b/i.test(statement)) {
        add(
          `changes a column's type on ${table}: add a new column, write both, move the reads, then drop the old`,
          true,
        );
      }
      if (/\bSET NOT NULL\b/i.test(statement)) {
        add(
          `makes a column of ${table} required: add a NOT VALID check (col IS NOT NULL), VALIDATE it in a later file, then SET NOT NULL as a contract step`,
          true,
        );
      }
      if (/\bADD COLUMN\b/i.test(statement)) {
        if (/\bNOT NULL\b/i.test(statement) && !/\bDEFAULT\b/i.test(statement)) {
          add(
            `adds a required column to ${table} with no default: add it nullable, fill it by a job, then require it`,
          );
        }
        if (VOLATILE_DEFAULT.test(statement) || SERIAL_TYPE.test(statement)) {
          add(
            `adds a column to ${table} whose default is worked out row by row, which rewrites the table under its lock: add it with no default, then set one`,
          );
        }
        if (
          /\bADD COLUMN (?:IF NOT EXISTS )?\S+ [^,]*\b(?:UNIQUE|PRIMARY KEY)\b/i.test(statement)
        ) {
          add(
            `adds a column to ${table} with its own unique rule, which builds an index under the table's lock`,
          );
        }
      }
      const constraint =
        /\bADD (?:CONSTRAINT \S+ )?(CHECK|FOREIGN KEY|UNIQUE|PRIMARY KEY|EXCLUDE)\b/i.exec(
          statement,
        );
      if (constraint) {
        const kind = (constraint[1] ?? '').toUpperCase();
        if ((kind === 'CHECK' || kind === 'FOREIGN KEY') && !/\bNOT VALID\b/i.test(statement)) {
          add(
            `adds a ${kind.toLowerCase()} to ${table} that checks every row under the table's lock: add it NOT VALID, and VALIDATE it in a later file`,
          );
        }
        if (
          (kind === 'UNIQUE' || kind === 'PRIMARY KEY' || kind === 'EXCLUDE') &&
          !/\bUSING INDEX\b/i.test(statement)
        ) {
          add(
            `adds a ${kind.toLowerCase()} rule to ${table} that builds its index under the table's lock: build a unique index CONCURRENTLY first, then ADD CONSTRAINT ... USING INDEX`,
          );
        }
        const named = /\bADD CONSTRAINT ("?[\w$]+"?)/i.exec(statement)?.[1];
        if (named) validated.add(`${table}:${columnName(named)}`);
      }
      const validate = /\bVALIDATE CONSTRAINT ("?[\w$]+"?)/i.exec(statement)?.[1];
      if (validate && validated.has(`${table}:${columnName(validate)}`)) {
        add(
          `validates ${validate} on ${table} in the file that adds it, so the scan holds the adding lock: validate it in a later file`,
        );
      }
    }

    if (index && table && existing && !/\bCONCURRENTLY\b/i.test(statement)) {
      add(
        `builds an index on ${table} without CONCURRENTLY, which stops every write to it until done: CREATE INDEX CONCURRENTLY IF NOT EXISTS in a file marked -- outside-transaction`,
      );
    }

    if (/^ALTER TYPE \S+ RENAME VALUE\b/i.test(statement)) {
      add(`renames a value the previous release still reads and writes ("${short}")`, true);
    }

    const dropped = DROP_TABLE.exec(statement)?.[1];
    if (dropped) {
      const name = tableName(dropped);
      add(`drops the table ${name}`, true);
      if (previous?.tables.has(name))
        add(`drops ${name}, which the previous release's schema still has`);
    }

    for (const [pattern, verb] of [
      [UPDATE, 'updates'],
      [DELETE, 'deletes'],
      [TRUNCATE, 'empties'],
      [INSERT, 'writes'],
    ] as const) {
      const written = pattern.exec(statement)?.[1];
      if (!written) continue;
      const name = tableName(written);
      if (created.has(name)) continue;
      // Adding Lytro's own reference rows is how settings arrive; changing them says why.
      if (verb === 'writes' && name.startsWith('control.')) continue;
      if (file.referenceData && name.startsWith('control.')) continue;
      add(
        `${verb} rows of ${name}: backfills and fixes are batched jobs that can run twice, after a dump (a small change to Lytro's own control.* settings may say -- reference-data: why)`,
        true,
      );
    }
  }

  if (file.contractOf !== null && previous && !previous.tags.has(file.contractOf)) {
    findings.push({
      message: `is the contract of ${file.contractOf}, which no earlier release has: the expand ships a release first`,
      contract: false,
    });
  }

  return findings
    .filter((finding) => !(finding.contract && file.contractOf !== null))
    .map((finding) =>
      finding.contract
        ? `${file.tag} ${finding.message}: only as the planned contract of an earlier expand (-- contract-of: NNNN_name)`
        : `${file.tag} ${finding.message}`,
    );
}
