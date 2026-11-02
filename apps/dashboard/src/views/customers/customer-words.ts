import { bangladeshiPhone } from '@/lib/phone';
import type { CustomerSummary } from '@/types/customers';

/** A customer's name, or their phone where a table's order left none. */
export const customerName = (customer: Pick<CustomerSummary, 'name' | 'phone'>): string =>
  customer.name ?? (customer.phone ? bangladeshiPhone.grouped(customer.phone) : '');

// Short everyday words, 7 letters at most: two of them and four digits fit the password's 20 characters, and read
// easily when a shopper types what the shop sent them.
const WORDS = [
  'amra',
  'aloo',
  'badal',
  'bagan',
  'bashi',
  'bela',
  'bhor',
  'bindu',
  'brishti',
  'chand',
  'chaya',
  'dhan',
  'dhara',
  'dupur',
  'ganga',
  'gach',
  'golap',
  'gram',
  'hawa',
  'holud',
  'jaba',
  'jamun',
  'jhor',
  'kanon',
  'kathal',
  'kolom',
  'lebu',
  'madhu',
  'mati',
  'megh',
  'mukta',
  'nodi',
  'nokshi',
  'pakhi',
  'palash',
  'pata',
  'phool',
  'pukur',
  'rangin',
  'rupa',
  'sagor',
  'shapla',
  'shikor',
  'shiuli',
  'surjo',
  'tara',
  'tista',
  'titli',
] as const;

/** A new password as drawn ("megh-7392-tara"), from the browser's own random numbers. */
export function generatedPassword(): string {
  const [first = 0, second = 0, digits = 0] = crypto.getRandomValues(new Uint32Array(3));
  const word = (value: number) => WORDS[value % WORDS.length] ?? 'megh';
  return `${word(first)}-${String(1000 + (digits % 9000))}-${word(second)}`;
}
