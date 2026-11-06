import { z } from 'zod';
import { CircuitBreaker } from '../../../common/circuit-breaker';
import type { AddressReader, ReaderAnswer } from '../ports/address-reader';

/** What Gemini needs, from the server's settings. The key is never logged. */
export interface GeminiSettings {
  baseUrl: string;
  apiKey: string;
}

export type AiFetch = (input: string, init: RequestInit) => Promise<Response>;

// Tried on 21 made-up messages in Bangla, English and the two mixed in Slice 7.6's read (2026-11-06): the line about
// police thanas made "Tongi" read as Gazipur Sadar, as Lytro's list has it.
export const ADDRESS_PROMPT = `You read a message that a customer in Bangladesh sent to an online shop, and pick out only the delivery
details. Answer with JSON by the schema, nothing else.
- name: the customer's name, exactly as written, in the script it was written in. null if there is none.
- phone: the customer's Bangladeshi mobile number as written. If there are several, the first. null if none.
- zilla: the district, in English, by its official name (for example Dhaka, Chattogram, Cumilla, Bogura). If the
  message names only an area, a town or an upazila, give the district it is in. null if you can't tell.
- thana: the upazila, or in a city the police thana, in English, by its official name (for example Mirpur,
  Double Mooring, Sherpur). If the message names a neighbourhood, market or road, give the thana it is in. In Dhaka,
  Chattogram, Khulna and Rajshahi cities give the police thana; everywhere else give the upazila, so a town's police
  station such as Kotwali, Tongi or Fatullah becomes its upazila (Sylhet Sadar, Gazipur Sadar, Narayanganj Sadar).
  null if you can't tell.
- address: the rest of the address exactly as written (house, road, block, sector, village, area, landmark), in the
  customer's script, leaving out the name, phone and note. null if none.
- note: a delivery instruction the customer wrote (when to come, call first, leave it with the guard), exactly as
  written. null if none.
Leave out anything about products, sizes, prices, payments or advance money. Never invent a value.`;

const FIELDS = ['name', 'phone', 'zilla', 'thana', 'address', 'note'] as const;

// Gemini's structured output: every field present, a string or null.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: Object.fromEntries(
    FIELDS.map((field) => [field, { type: 'STRING', nullable: true }]),
  ),
  required: [...FIELDS],
  propertyOrdering: [...FIELDS],
};

// A detail as Gemini gives it: text, with an empty string read as nothing.
const detail = z
  .string()
  .nullable()
  .transform((value) => (value === null || value.trim() === '' ? null : value.trim()));
const detailsSchema = z.object(
  Object.fromEntries(FIELDS.map((field) => [field, detail])) as {
    [K in (typeof FIELDS)[number]]: typeof detail;
  },
);

// What Gemini's generateContent answers with, as far as Lytro reads it.
const answerSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string() })).min(1) }).optional(),
      }),
    )
    .optional(),
});

// ORD-33: a read waits this long for Gemini while staff wait; the read tried at 1.4 s, its slowest at 8 s.
const TIMEOUT_MS = 15_000;
const CIRCUIT = 'ai:gemini';

/**
 * D7-4 (Phase 7 Slice 7.6): Google Gemini reads a customer's delivery details, always over HTTPS, with the key in a
 * header, never the address. Each read is one call: the message, the instructions and the shape of the answer. An
 * answer that isn't the shape asked for is unreadable; an error or no answer in time is thrown, for the circuit (PRF-05).
 * The message is never logged, and Google keeps it only for abuse checks on a paid key (D7-18).
 */
export class GeminiAddressReader implements AddressReader {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly settings: GeminiSettings,
    private readonly fetchAi: AiFetch,
    breaker: CircuitBreaker = new CircuitBreaker(),
  ) {
    if (!settings.baseUrl.startsWith('https://')) {
      throw new Error('Gemini is only called over HTTPS');
    }
    this.breaker = breaker;
  }

  read(text: string, model: string): Promise<ReaderAnswer> {
    return this.breaker.call(CIRCUIT, () => this.ask(text, model));
  }

  private async ask(text: string, model: string): Promise<ReaderAnswer> {
    const response = await this.fetchAi(
      `${this.settings.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.settings.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ADDRESS_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0,
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      // Busy (429, 503), a wrong model or a refused key: no read, and the circuit counts it.
      throw new Error(`Gemini answered HTTP ${String(response.status)}`);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: 'unreadable' };
    }
    const answer = answerSchema.safeParse(body);
    const written = answer.success
      ? answer.data.candidates?.[0]?.content?.parts[0]?.text
      : undefined;
    if (written === undefined) return { kind: 'unreadable' };
    let details: unknown;
    try {
      details = JSON.parse(written);
    } catch {
      return { kind: 'unreadable' };
    }
    const parsed = detailsSchema.safeParse(details);
    return parsed.success ? { kind: 'read', details: parsed.data } : { kind: 'unreadable' };
  }
}
