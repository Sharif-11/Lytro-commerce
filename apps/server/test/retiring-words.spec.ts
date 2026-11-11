import { describe, expect, it } from 'vitest';
import { CourierKey, PaymentMethod } from '@lytronix/validators';
import {
  courierRetiringText,
  paymentMethodRetiringText,
} from '../src/modules/notifications/notification-words';

// D8-78 (the owner, 2026-11-10, and for couriers 2026-11-11, KNOWN-GAPS §142): Lytro retiring something reads
// "রিটায়ার হচ্ছে" in Bangla, a payment method and a courier alike, as the dashboard's chips say it.
describe('the retiring notices', () => {
  it('says a payment method is being retired in the one word', () => {
    const text = paymentMethodRetiringText(PaymentMethod.Nagad);
    expect(text.bn.title).toMatch(/রিটায়ার হচ্ছে$/);
    expect(text.bn.body).toMatch(/^Lytro .+ রিটায়ার করছে।/);
  });

  it('says a courier is being retired in the same word', () => {
    const text = courierRetiringText({
      courierKey: CourierKey.Steadfast,
      suggestedKey: CourierKey.Pathao,
      defaultMovedTo: CourierKey.Pathao,
    });
    expect(text.bn.title).toBe('Steadfast রিটায়ার হচ্ছে');
    expect(text.bn.body).toMatch(/^Lytro Steadfast রিটায়ার করছে। /);
    expect(text.bn.body).not.toMatch(/বন্ধ/);
    expect(text.en.title).toBe('Steadfast is being retired');
  });
});
