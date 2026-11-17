import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as everything from '../src';
import { walkSchema } from './support/schema-walk';

// SEC-12 (Phase 9 Slice 9.7): every string any schema of this package takes has a longest length, so no request can send
// a field without end. A string whose form already bounds it (an ID, an email, a date) counts as bounded. A new
// unbounded string fails here, by the export and the path to it.
const FORMS_THAT_BOUND = new Set([
  'uuid',
  'guid',
  'cuid',
  'cuid2',
  'ulid',
  'datetime',
  'date',
  'time',
  'ipv4',
  'ipv6',
]);

/** Every string inside the schema with neither a longest length nor a form that bounds it, by its path. */
function unboundedIn(schema: z.ZodType): string[] {
  const found: string[] = [];
  walkSchema(schema, ({ schema: part, def, path }) => {
    if (def.type !== 'string') return;
    const string = part as z.ZodString;
    const bounded =
      string.maxLength !== null || (string.format !== null && FORMS_THAT_BOUND.has(string.format));
    if (!bounded) found.push(path || '(the whole value)');
  });
  return found;
}

describe('every string a schema takes is bounded (SEC-12)', () => {
  it('has a longest length, or a form that bounds it', () => {
    const found: string[] = [];
    for (const [name, value] of Object.entries(everything)) {
      if (!(value instanceof z.ZodType)) continue;
      for (const path of unboundedIn(value)) found.push(`${name}: ${path}`);
    }
    expect(found).toEqual([]);
  });
});
