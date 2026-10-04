export type AddressCheck =
  | { ok: true; address: string }
  | { ok: false; reason: 'format' | 'unavailable'; suggestion: string | null };
