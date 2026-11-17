import type { z } from 'zod';

// The tests that read every schema this package exports (SEC-12's bounded strings, API-16's named fields, the Zod 4
// defaults check) walk them by Zod 4's own description of each schema, `_zod.def`: its `type` and its parts.

/** A schema as the walk sees it: its kind and its parts, untyped. */
export function defOf(schema: z.ZodType): Record<string, unknown> & { type: string } {
  return schema._zod.def as unknown as Record<string, unknown> & { type: string };
}

/** The kinds that only wrap one schema: the value is still that schema's, or nothing. */
export const WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'catch',
  'readonly',
  'nonoptional',
  'success',
]);

export interface Visit {
  schema: z.ZodType;
  def: Record<string, unknown> & { type: string };
  path: string;
}

/**
 * Calls `visit` on the schema and each schema inside it, once each, with the path to it (`a.b`, `items[]`). A pipe is
 * walked by the side that reads the request: its input, or, after a function that rewrites the value first
 * (`z.preprocess`), its output.
 */
export function walkSchema(
  schema: z.ZodType,
  visit: (at: Visit) => void,
  path = '',
  seen = new Set<z.ZodType>(),
): void {
  if (seen.has(schema)) return;
  seen.add(schema);
  const def = defOf(schema);
  visit({ schema, def, path });
  const next = (child: unknown, at: string): void => {
    walkSchema(child as z.ZodType, visit, at, seen);
  };
  switch (def.type) {
    case 'object':
      for (const [key, field] of Object.entries(def['shape'] as Record<string, z.ZodType>)) {
        next(field, path ? `${path}.${key}` : key);
      }
      return;
    case 'array':
      next(def['element'], `${path}[]`);
      return;
    case 'pipe': {
      const into = def['in'] as z.ZodType;
      next(defOf(into).type === 'transform' ? def['out'] : into, path);
      return;
    }
    case 'lazy':
      next((def['getter'] as () => z.ZodType)(), path);
      return;
    case 'union':
      for (const option of def['options'] as z.ZodType[]) next(option, path);
      return;
    case 'intersection':
      next(def['left'], path);
      next(def['right'], path);
      return;
    case 'record':
      next(def['keyType'], `${path}{key}`);
      next(def['valueType'], `${path}{}`);
      return;
    case 'tuple':
      (def['items'] as z.ZodType[]).forEach((item, index) => {
        next(item, `${path}[${String(index)}]`);
      });
      if (def['rest']) next(def['rest'], `${path}[]`);
      return;
    default:
      if (WRAPPERS.has(def.type)) next(def['innerType'], path);
  }
}
