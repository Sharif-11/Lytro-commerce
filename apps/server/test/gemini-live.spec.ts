import { describe, expect, it, vi } from 'vitest';
import { GeminiAddressReader } from '../src/modules/address-reads/providers/gemini-address-reader';
import { DEFAULT_ADDRESS_READ_MODEL } from '../src/modules/address-reads/services/address-reads';

// D7-4 (Phase 7 Slice 7.6): three made-up messages read by the real Gemini, at a fraction of a paisa each. Run it by hand
// with GEMINI_LIVE_TEST=1 and the key set, never in CI. Only made-up messages go here: a real customer's message goes only
// through a key whose Google project has billing on (D7-18).
const live = process.env['GEMINI_LIVE_TEST'] === '1' && Boolean(process.env['GEMINI_API_KEY']);
vi.setConfig({ testTimeout: 60_000 });

describe.skipIf(!live)(
  'D7-4: reading delivery details through the real Gemini (by hand only)',
  () => {
    const reader = new GeminiAddressReader(
      {
        baseUrl:
          process.env['GEMINI_BASE_URL'] ?? 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: process.env['GEMINI_API_KEY'] ?? '',
      },
      (url, init) => fetch(url, init),
    );
    const model = process.env['GEMINI_LIVE_MODEL'] ?? DEFAULT_ADDRESS_READ_MODEL;

    it('reads a Bangla message, Bangla digits and all', async () => {
      const read = await reader.read(
        'নাম: রাশেদ করিম\nমোবাইল: ০১৭১১০০০০০১\nঠিকানা: বাসা ১২, রোড ৪, ধানমন্ডি, ঢাকা',
        model,
      );
      expect(read.kind).toBe('read');
      if (read.kind !== 'read') return;
      expect(read.details).toMatchObject({
        name: 'রাশেদ করিম',
        zilla: 'Dhaka',
        thana: 'Dhanmondi',
      });
      expect(read.details.phone).not.toBeNull();
    });

    it('reads an old spelling and a delivery note in English', async () => {
      const read = await reader.read(
        'Name: Habib, mobile +8801515000005, village Madhaiya, Chandina upazila, Comilla. Please call before coming.',
        model,
      );
      expect(read.kind).toBe('read');
      if (read.kind !== 'read') return;
      expect(read.details).toMatchObject({ name: 'Habib', zilla: 'Cumilla', thana: 'Chandina' });
      expect(read.details.note).toMatch(/call/i);
    });

    it('finds nothing in a message with no delivery details', async () => {
      const read = await reader.read('ভাই দাম কত?', model);
      expect(read).toEqual({
        kind: 'read',
        details: { name: null, phone: null, zilla: null, thana: null, address: null, note: null },
      });
    });
  },
);
