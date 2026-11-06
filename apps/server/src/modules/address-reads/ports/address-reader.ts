import type { AiProvider } from '@lytronix/validators';

/** ORD-30 (amended 2026-11-06): the delivery details an AI read from a pasted message, each as written, or null. */
export interface ReadDetails {
  name: string | null;
  phone: string | null;
  /** The zilla and thana in English, by their official names, for Lytro's matcher (ORD-31). */
  zilla: string | null;
  thana: string | null;
  address: string | null;
  note: string | null;
}

/** What a read gave: the details, or an answer that couldn't be used (ORD-33: never charged). */
export type ReaderAnswer = { kind: 'read'; details: ReadDetails } | { kind: 'unreadable' };

/**
 * D7-4, AI-10: an AI that reads delivery details from a pasted message. A reader that gives no answer, or not in time,
 * throws, and that counts against its circuit (PRF-05); an answer it can't use is `unreadable`, and doesn't.
 */
export interface AddressReader {
  read(text: string, model: string): Promise<ReaderAnswer>;
}

/** AI-10: one reader for each AI the operator can choose. */
export type AddressReaders = Record<AiProvider, AddressReader>;
