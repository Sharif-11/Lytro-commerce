import { describe, expect, it } from 'vitest';
import {
  AddonKind,
  AddressFieldState,
  AllowanceService,
  createAddonSchema,
} from '@lytronix/validators';
import { CircuitBreaker, CircuitOpen } from '../src/common/circuit-breaker';
import { EnvironmentParser } from '../src/config/env';
import {
  addressReadersFor,
  aiModeOf,
} from '../src/modules/address-reads/providers/address-reader-choice';
import {
  ADDRESS_PROMPT,
  GeminiAddressReader,
} from '../src/modules/address-reads/providers/gemini-address-reader';
import { StandInAddressReader } from '../src/modules/address-reads/providers/stand-in-address-reader';
import {
  foundSomething,
  latinDigits,
  shapeRead,
} from '../src/modules/address-reads/services/address-details';
import type { ReadDetails } from '../src/modules/address-reads/ports/address-reader';
import { PlaceMatcher } from '../src/modules/delivery/services/place-matching';

// Phase 7 Slice 7.6 (read agreed 2026-11-06): reading a customer's delivery details, the parts that need no database --
// Gemini's adapter against a fake Google, the modes (D7-22), the settings' guard, and how a read becomes the order form's
// details (ORD-30, ORD-31, ORD-34 amended). The real Gemini is tried in gemini-live.spec.ts, only when a key is given.

const SETTINGS = { baseUrl: 'https://gemini.test/v1beta', apiKey: 'secret-key' };
const MODEL = 'gemini-3.5-flash-lite';

interface Call {
  url: string;
  init: RequestInit;
}

/** Google's answer to a read, as generateContent gives it: the details as JSON text in the first part. */
function answering(details: unknown, status = 200): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const respond = (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const text = typeof details === 'string' ? details : JSON.stringify(details);
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return { fetch: respond as typeof fetch, calls };
}

const RASHED: ReadDetails = {
  name: 'রাশেদ করিম',
  phone: '০১৭১১-০০০০০১',
  zilla: 'Dhaka',
  thana: 'Dhanmondi',
  address: 'বাসা ১২, রোড ৪',
  note: 'সন্ধ্যার পর দিবেন',
};

describe("D7-4: Gemini's adapter", () => {
  it('asks the chosen model over HTTPS, with the key in a header and never the address', async () => {
    const google = answering(RASHED);
    const reader = new GeminiAddressReader(SETTINGS, google.fetch);
    const read = await reader.read('নাম: রাশেদ করিম ...', MODEL);
    expect(read).toEqual({ kind: 'read', details: RASHED });
    const call = google.calls[0];
    expect(call?.url).toBe(`https://gemini.test/v1beta/models/${MODEL}:generateContent`);
    expect(call?.url).not.toContain('secret-key');
    expect((call?.init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(call?.init.body as string) as {
      systemInstruction: { parts: { text: string }[] };
      contents: { parts: { text: string }[] }[];
      generationConfig: { responseMimeType: string; responseSchema: { required: string[] } };
    };
    expect(body.systemInstruction.parts[0]?.text).toBe(ADDRESS_PROMPT);
    expect(body.contents[0]?.parts[0]?.text).toBe('নাম: রাশেদ করিম ...');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual([
      'name',
      'phone',
      'zilla',
      'thana',
      'address',
      'note',
    ]);
  });

  it('reads an empty detail as nothing, and trims the rest', async () => {
    const reader = new GeminiAddressReader(
      SETTINGS,
      answering({ ...RASHED, name: '  ', note: ' call first ' }).fetch,
    );
    expect(await reader.read('x', MODEL)).toEqual({
      kind: 'read',
      details: { ...RASHED, name: null, note: 'call first' },
    });
  });

  it('calls an answer of the wrong shape unreadable, never a read (ORD-33)', async () => {
    for (const broken of ['not json', JSON.stringify({ name: 'Rina' }), JSON.stringify([1, 2])]) {
      const reader = new GeminiAddressReader(SETTINGS, answering(broken).fetch);
      expect(await reader.read('x', MODEL)).toEqual({ kind: 'unreadable' });
    }
    const empty = (() =>
      Promise.resolve(new Response(JSON.stringify({ candidates: [] })))) as typeof fetch;
    expect(await new GeminiAddressReader(SETTINGS, empty).read('x', MODEL)).toEqual({
      kind: 'unreadable',
    });
  });

  it('throws on a busy or refused answer, and its circuit opens after five (PRF-05)', async () => {
    const google = answering(RASHED, 429);
    const reader = new GeminiAddressReader(SETTINGS, google.fetch, new CircuitBreaker());
    for (let tried = 0; tried < 5; tried += 1) {
      await expect(reader.read('x', MODEL)).rejects.toThrow(/HTTP 429/);
    }
    await expect(reader.read('x', MODEL)).rejects.toBeInstanceOf(CircuitOpen);
    expect(google.calls).toHaveLength(5);
  });

  it('is only ever called over HTTPS', () => {
    expect(
      () => new GeminiAddressReader({ ...SETTINGS, baseUrl: 'http://gemini.test' }, fetch),
    ).toThrow(/HTTPS/);
  });
});

describe('D7-22: where a message is read depends on the mode', () => {
  const ENV = { GEMINI_BASE_URL: SETTINGS.baseUrl, GEMINI_API_KEY: 'key' };

  it('uses the stand-in in tests and development unless forced, and Gemini in production', () => {
    expect(aiModeOf({ NODE_ENV: 'test', AI_FORCE_REAL: true })).toBe('stand-in');
    expect(aiModeOf({ NODE_ENV: 'development', AI_FORCE_REAL: false })).toBe('stand-in');
    expect(aiModeOf({ NODE_ENV: 'development', AI_FORCE_REAL: true })).toBe('real');
    expect(aiModeOf({ NODE_ENV: 'production', AI_FORCE_REAL: false })).toBe('real');
    expect(
      addressReadersFor({ NODE_ENV: 'development', AI_FORCE_REAL: false, ...ENV }, fetch).gemini,
    ).toBeInstanceOf(StandInAddressReader);
    expect(
      addressReadersFor({ NODE_ENV: 'production', AI_FORCE_REAL: false, ...ENV }, fetch).gemini,
    ).toBeInstanceOf(GeminiAddressReader);
  });

  it('never falls back to the stand-in when it should read for real and has no key', () => {
    expect(() =>
      addressReadersFor(
        { NODE_ENV: 'production', AI_FORCE_REAL: false, GEMINI_BASE_URL: SETTINGS.baseUrl },
        fetch,
      ),
    ).toThrow(/GEMINI_API_KEY/);
  });

  it('the stand-in finds a mobile number and nothing else, and logs no message', async () => {
    const read = await new StandInAddressReader().read('নাম রিনা, ফোন ০১৮১২-০০০০০২', MODEL);
    expect(read).toEqual({
      kind: 'read',
      details: {
        name: null,
        phone: '01812-000002',
        zilla: null,
        thana: null,
        address: null,
        note: null,
      },
    });
  });
});

describe("D7-22: the settings guard Gemini's key", () => {
  const SECRET = 'x'.repeat(32);
  const BASE = { DATABASE_URL: 'postgres://db', OTP_SECRET: SECRET };
  const PRODUCTION = {
    ...BASE,
    NODE_ENV: 'production',
    TRUSTED_EDGE_SECRET: SECRET,
    STOREFRONT_SECRET: SECRET,
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    PLATFORM_ADDRESSES: '203.0.113.10',
    BULKSMSBD_API_KEY: 'key',
    BULKSMSBD_SENDER_ID: 'sender',
  };

  it('refuses production, staging included, without the key', () => {
    expect(() => new EnvironmentParser().parse(PRODUCTION)).toThrow(
      /GEMINI_API_KEY: required in production/,
    );
    const env = new EnvironmentParser().parse({ ...PRODUCTION, GEMINI_API_KEY: 'key' });
    expect(env.GEMINI_BASE_URL).toBe('https://generativelanguage.googleapis.com/v1beta');
  });

  it('needs no key in development, unless AI_FORCE_REAL is set', () => {
    expect(new EnvironmentParser().parse(BASE).AI_FORCE_REAL).toBe(false);
    expect(() => new EnvironmentParser().parse({ ...BASE, AI_FORCE_REAL: 'true' })).toThrow(
      /GEMINI_API_KEY: required when AI_FORCE_REAL is set/,
    );
  });

  it('refuses a Gemini address that is not https', () => {
    expect(() =>
      new EnvironmentParser().parse({ ...BASE, GEMINI_BASE_URL: 'http://gemini.test' }),
    ).toThrow(/GEMINI_BASE_URL/);
  });
});

describe('ORD-30, ORD-31 (amended 2026-11-06): a read as the order form takes it', () => {
  const places = new PlaceMatcher([
    {
      id: 1,
      nameEn: 'Dhaka',
      nameBn: 'ঢাকা',
      thanas: [
        { id: 11, nameEn: 'Dhanmondi', nameBn: 'ধানমন্ডি', cityCode: 'dhaka' },
        { id: 12, nameEn: 'Mirpur', nameBn: 'মিরপুর', cityCode: 'dhaka' },
      ],
    },
    {
      id: 2,
      nameEn: 'Cumilla',
      nameBn: 'কুমিল্লা',
      thanas: [{ id: 21, nameEn: 'Chandina', nameBn: 'চান্দিনা', cityCode: null }],
    },
    {
      id: 3,
      nameEn: 'Narayanganj',
      nameBn: 'নারায়ণগঞ্জ',
      thanas: [{ id: 31, nameEn: 'Narayanganj Sadar', nameBn: 'নারায়ণগঞ্জ সদর', cityCode: null }],
    },
  ]);

  it('writes Bangla digits as Latin ones', () => {
    expect(latinDigits('০১৭১১-০০০০০১, বাসা ১২')).toBe('01711-000001, বাসা 12');
  });

  it('fills every field when everything is read and matched, with full confidence', () => {
    expect(shapeRead(RASHED, places)).toEqual({
      draft: {
        customerName: 'রাশেদ করিম',
        phone: '01711000001',
        zillaId: 1,
        locationId: 11,
        deliveryAddress: 'বাসা ১২, রোড ৪',
        notes: 'সন্ধ্যার পর দিবেন',
      },
      fields: {
        customerName: AddressFieldState.Found,
        phone: AddressFieldState.Found,
        zilla: AddressFieldState.Found,
        thana: AddressFieldState.Found,
        deliveryAddress: AddressFieldState.Found,
        notes: AddressFieldState.Found,
      },
      written: { phone: null, zilla: null, thana: null },
      confidence: 1,
    });
  });

  it('matches an old spelling and a thana with more after it, by their own names', () => {
    const read = shapeRead({ ...RASHED, zilla: 'Comilla', thana: 'Chandina upazila' }, places);
    expect(read.draft).toMatchObject({ zillaId: 2, locationId: 21 });
    expect(read.fields.thana).toBe(AddressFieldState.Found);
    const mirpur = shapeRead({ ...RASHED, thana: 'Mirpur 10' }, places);
    expect(mirpur.draft.locationId).toBe(12);
    expect(mirpur.fields.thana).toBe(AddressFieldState.Found);
  });

  it('fills a near thana to check, and leaves one off the list as written', () => {
    const near = shapeRead({ ...RASHED, thana: 'Dhanmandi' }, places);
    expect(near.draft.locationId).toBe(11);
    expect(near.fields.thana).toBe(AddressFieldState.Check);
    expect(near.written.thana).toBe('Dhanmandi');
    const off = shapeRead({ ...RASHED, zilla: 'Narayanganj', thana: 'Fatullah' }, places);
    expect(off.draft).toMatchObject({ zillaId: 3, locationId: null });
    expect(off.fields.thana).toBe(AddressFieldState.Missing);
    expect(off.written).toEqual({ phone: null, zilla: null, thana: 'Fatullah' });
    expect(off.confidence).toBe(0.8);
  });

  it("leaves a number that isn't a mobile for staff, and an unknown zilla as written", () => {
    const read = shapeRead({ ...RASHED, phone: '02-9876543', zilla: 'Atlantis' }, places);
    expect(read.draft).toMatchObject({ phone: null, zillaId: null, locationId: null });
    expect(read.fields).toMatchObject({
      phone: AddressFieldState.Check,
      zilla: AddressFieldState.Missing,
      thana: AddressFieldState.Missing,
    });
    expect(read.written).toEqual({ phone: '02-9876543', zilla: 'Atlantis', thana: 'Dhanmondi' });
    expect(read.confidence).toBe(0.5);
  });

  it('is charged only for a name with a phone, or a place (ORD-34 amended)', () => {
    const none: ReadDetails = {
      name: null,
      phone: null,
      zilla: null,
      thana: null,
      address: null,
      note: null,
    };
    expect(foundSomething(shapeRead(none, places))).toBe(false);
    expect(foundSomething(shapeRead({ ...none, phone: '01711000001' }, places))).toBe(false);
    expect(foundSomething(shapeRead({ ...none, name: 'Rina' }, places))).toBe(false);
    expect(foundSomething(shapeRead({ ...none, address: 'House 5' }, places))).toBe(false);
    expect(foundSomething(shapeRead({ ...none, name: 'Rina', phone: '01711000001' }, places))).toBe(
      true,
    );
    expect(foundSomething(shapeRead({ ...none, name: 'Rina', phone: '12345' }, places))).toBe(true);
    expect(foundSomething(shapeRead({ ...none, zilla: 'Dhaka' }, places))).toBe(true);
  });
});

describe('PLN-13, PLN-20: an allowance in the catalogue', () => {
  const ITEM = {
    key: 'address_reads_500',
    price: 45,
    labelEn: 'Address reads',
    labelBn: 'মেসেজ থেকে ঠিকানা পড়া',
  };

  it('names the service it covers and how many uses one holds', () => {
    expect(
      createAddonSchema.safeParse({
        ...ITEM,
        kind: AddonKind.Allowance,
        limitKey: AllowanceService.AddressReads,
        unitSize: 500,
      }).success,
    ).toBe(true);
    expect(
      createAddonSchema.safeParse({ ...ITEM, kind: AddonKind.Allowance, unitSize: 500 }).success,
    ).toBe(false);
    expect(
      createAddonSchema.safeParse({
        ...ITEM,
        kind: AddonKind.Allowance,
        limitKey: AllowanceService.AddressReads,
      }).success,
    ).toBe(false);
  });

  it('never mixes a service and a limit', () => {
    expect(
      createAddonSchema.safeParse({
        ...ITEM,
        kind: AddonKind.Allowance,
        limitKey: 'products',
        unitSize: 500,
      }).success,
    ).toBe(false);
    expect(
      createAddonSchema.safeParse({
        ...ITEM,
        kind: AddonKind.Limit,
        limitKey: AllowanceService.AddressReads,
        unitSize: 500,
      }).success,
    ).toBe(false);
  });
});
