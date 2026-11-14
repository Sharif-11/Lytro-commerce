import { readFileSync } from 'node:fs';
import path from 'node:path';

/** As much of a drizzle-kit snapshot as says which values a column may hold. */
interface Snapshot {
  enums: Record<string, { values: string[] }>;
  tables: Record<
    string,
    {
      name: string;
      schema: string;
      columns: Record<string, { name: string; type: string; typeSchema?: string }>;
      checkConstraints?: Record<string, { value: string }>;
    }
  >;
}

/** A value a column may hold. */
export interface ColumnValue {
  /** schema.table */
  table: string;
  column: string;
  value: string;
}

// A check's "schema"."table"."column" in ('a', 'b'), wherever it sits in the check (often after IS NULL OR).
const IN_LIST = /"(\w+)"\."(\w+)"\."(\w+)"\s+in\s+\(((?:\s*'[^']*'\s*,?)+)\)/gi;

/** Every value each column may hold, by an enum type or a check's list: "schema.table.column" to its values. */
export function valuesOf(snapshot: Snapshot): Map<string, Set<string>> {
  const values = new Map<string, Set<string>>();
  const add = (key: string, value: string): void => {
    const set = values.get(key) ?? new Set<string>();
    set.add(value);
    values.set(key, set);
  };
  for (const table of Object.values(snapshot.tables)) {
    for (const column of Object.values(table.columns)) {
      const type = column.typeSchema
        ? snapshot.enums[`${column.typeSchema}.${column.type}`]
        : undefined;
      for (const value of type?.values ?? [])
        add(`${table.schema}.${table.name}.${column.name}`, value);
    }
    for (const check of Object.values(table.checkConstraints ?? {})) {
      for (const match of check.value.matchAll(IN_LIST)) {
        for (const quoted of (match[4] ?? '').matchAll(/'([^']*)'/g)) {
          add(`${match[1] ?? ''}.${match[2] ?? ''}.${match[3] ?? ''}`, quoted[1] ?? '');
        }
      }
    }
  }
  return values;
}

/** The values the current schema's columns may hold that the previous release's could not. */
export function newValues(previous: Snapshot, current: Snapshot): ColumnValue[] {
  const before = valuesOf(previous);
  const found: ColumnValue[] = [];
  for (const [key, values] of valuesOf(current)) {
    const known = before.get(key);
    // A column the previous release didn't have isn't read by it at all.
    if (!known) continue;
    const [schema = '', table = '', column = ''] = key.split('.');
    for (const value of values) {
      if (!known.has(value)) found.push({ table: `${schema}.${table}`, column, value });
    }
  }
  return found;
}

export function readSnapshot(file: string): Snapshot {
  return JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
}

/** This branch's newest snapshot. */
export function currentSnapshot(): Snapshot {
  const folder = path.resolve(__dirname, '../../../../packages/db/drizzle/meta');
  const journal = JSON.parse(readFileSync(path.join(folder, '_journal.json'), 'utf8')) as {
    entries: { tag: string }[];
  };
  const newest = journal.entries.at(-1)?.tag.slice(0, 4) ?? '';
  return readSnapshot(path.join(folder, `${newest}_snapshot.json`));
}
