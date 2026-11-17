import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as everything from '../src';
import { coercedDateField, dateField } from '../src';
import { defOf, walkSchema } from './support/schema-walk';

// Schemas that mean something else in Zod 4 than they meant in Zod 3, when this package moved (2026-11-17). Each
// test finds them in every schema exported here, so a new one fails here rather than in a shop's request.

/** Each export's findings, as `export: path`. */
function acrossExports(find: (schema: z.ZodType) => string[]): string[] {
  const found: string[] = [];
  for (const [name, value] of Object.entries(everything)) {
    if (!(value instanceof z.ZodType)) continue;
    for (const path of find(value)) found.push(`${name}: ${path}`);
  }
  return found;
}

// Zod 4 fills a field's default even when the field is optional and left out (Zod 3 left it out). An update made with
// `.partial()` of a schema with a default would then put the default back over the stored value. So no field may be
// optional around a default: an update leaves out what it doesn't change.
const AROUND = new Set(['optional', 'nullable', 'readonly']);

function optionalDefaultsIn(schema: z.ZodType): string[] {
  const found: string[] = [];
  walkSchema(schema, ({ def, path }) => {
    if (def.type !== 'object') return;
    for (const [key, field] of Object.entries(def['shape'] as Record<string, z.ZodType>)) {
      let part = defOf(field);
      if (part.type !== 'optional') continue;
      while (AROUND.has(part.type)) part = defOf(part['innerType'] as z.ZodType);
      if (part.type === 'default' || part.type === 'prefault') {
        found.push(path ? `${path}.${key}` : key);
      }
    }
  });
  return found;
}

// Zod 4's record over keys from a fixed list (an enum) wants every key of the list; Zod 3's took any of them. A request
// switching one SMS event, or a count per order status with none in some, would be refused. `z.partialRecord` keeps
// Zod 3's meaning.
function wholeRecordsIn(schema: z.ZodType): string[] {
  const found: string[] = [];
  walkSchema(schema, ({ def, path }) => {
    if (def.type !== 'record') return;
    const keys = def['keyType'] as z.ZodType;
    if (keys._zod.values !== undefined && def['partial'] !== true)
      found.push(path || '(the whole value)');
  });
  return found;
}

describe('no optional field fills itself in (Zod 4)', () => {
  it('has no default inside an optional field', () => {
    expect(acrossExports(optionalDefaultsIn)).toEqual([]);
  });

  it('finds one where there is', () => {
    const update = z
      .object({ name: z.string().max(10), active: z.boolean().default(true) })
      .partial();
    expect(optionalDefaultsIn(update)).toEqual(['active']);
    // What it guards against: the left-out field comes back as its default.
    expect(update.parse({ name: 'x' })).toEqual({ name: 'x', active: true });
  });
});

describe('no record wants every key of a list (Zod 4)', () => {
  it('has no record over a fixed list of keys but a partial one', () => {
    expect(acrossExports(wholeRecordsIn)).toEqual([]);
  });

  it('finds one where there is, and takes part of a list with a partial one', () => {
    const keys = z.enum(['a', 'b']);
    expect(wholeRecordsIn(z.record(keys, z.boolean()))).toEqual(['(the whole value)']);
    expect(wholeRecordsIn(z.partialRecord(keys, z.boolean()))).toEqual([]);
    expect(z.record(keys, z.boolean()).safeParse({ a: true }).success).toBe(false);
    expect(z.partialRecord(keys, z.boolean()).safeParse({ a: true }).success).toBe(true);
  });
});

// Zod 4's JSON Schema has no Date, and the API's docs are written by it as the server starts: a plain z.date() stopped
// the server (2026-11-17). Every date is dateField() or coercedDateField(), documented as an ISO 8601 string.
function undocumentedDatesIn(schema: z.ZodType): string[] {
  const found: string[] = [];
  walkSchema(schema, ({ schema: part, def, path }) => {
    if (def.type === 'date' && part._zod.toJSONSchema === undefined) {
      found.push(path || '(the whole value)');
    }
  });
  return found;
}

describe('every date says how the docs write it (Zod 4)', () => {
  it('is dateField() or coercedDateField()', () => {
    expect(acrossExports(undocumentedDatesIn)).toEqual([]);
  });

  it('finds a plain one, and writes the shared ones as date-time strings', () => {
    expect(undocumentedDatesIn(z.object({ at: z.date() }))).toEqual(['at']);
    expect(
      z.toJSONSchema(z.object({ at: dateField(), since: coercedDateField().nullable() })),
    ).toMatchObject({
      properties: {
        at: { type: 'string', format: 'date-time' },
        since: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
      },
    });
  });
});
