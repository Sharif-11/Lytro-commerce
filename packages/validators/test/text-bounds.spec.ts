import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as everything from '../src';

// SEC-12 (Phase 9 Slice 9.7): every string any schema of this package takes has a longest length, so no request can send
// a field without end. A string whose form already bounds it (an ID, an email, a date) counts as bounded. A new
// unbounded string fails here, by the export and the path to it.
const FORMS_THAT_BOUND = new Set([
  'uuid',
  'cuid',
  'cuid2',
  'ulid',
  'datetime',
  'date',
  'time',
  'ip',
  'length',
]);

function unboundedIn(
  schema: z.ZodTypeAny,
  path: string,
  seen: Set<z.ZodTypeAny>,
  found: string[],
): void {
  if (seen.has(schema)) return;
  seen.add(schema);
  const def = schema._def as { typeName?: string } & Record<string, unknown>;
  switch (def.typeName) {
    case 'ZodString': {
      const string = schema as z.ZodString;
      const bounded =
        string.maxLength !== null ||
        string._def.checks.some((check) => FORMS_THAT_BOUND.has(check.kind));
      if (!bounded) found.push(path || '(the whole value)');
      return;
    }
    case 'ZodObject': {
      const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>;
      for (const [key, field] of Object.entries(shape)) {
        unboundedIn(field, path ? `${path}.${key}` : key, seen, found);
      }
      return;
    }
    case 'ZodArray':
      unboundedIn((schema as z.ZodArray<z.ZodTypeAny>).element, `${path}[]`, seen, found);
      return;
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'ZodReadonly':
    case 'ZodBranded':
      unboundedIn(def['innerType'] as z.ZodTypeAny, path, seen, found);
      return;
    case 'ZodEffects':
      unboundedIn(def['schema'] as z.ZodTypeAny, path, seen, found);
      return;
    case 'ZodPipeline':
      unboundedIn(def['in'] as z.ZodTypeAny, path, seen, found);
      return;
    case 'ZodLazy':
      unboundedIn((def['getter'] as () => z.ZodTypeAny)(), path, seen, found);
      return;
    case 'ZodUnion':
    case 'ZodDiscriminatedUnion':
      for (const option of def['options'] as z.ZodTypeAny[]) unboundedIn(option, path, seen, found);
      return;
    case 'ZodIntersection':
      unboundedIn(def['left'] as z.ZodTypeAny, path, seen, found);
      unboundedIn(def['right'] as z.ZodTypeAny, path, seen, found);
      return;
    case 'ZodRecord':
      unboundedIn(def['keyType'] as z.ZodTypeAny, `${path}{key}`, seen, found);
      unboundedIn(def['valueType'] as z.ZodTypeAny, `${path}{}`, seen, found);
      return;
    case 'ZodTuple':
      (def['items'] as z.ZodTypeAny[]).forEach((item, index) => {
        unboundedIn(item, `${path}[${String(index)}]`, seen, found);
      });
      return;
    default:
      return;
  }
}

describe('every string a schema takes is bounded (SEC-12)', () => {
  it('has a longest length, or a form that bounds it', () => {
    const found: string[] = [];
    for (const [name, value] of Object.entries(everything)) {
      if (!(value instanceof z.ZodType)) continue;
      const paths: string[] = [];
      unboundedIn(value, '', new Set(), paths);
      for (const path of paths) found.push(`${name}: ${path}`);
    }
    expect(found).toEqual([]);
  });
});
