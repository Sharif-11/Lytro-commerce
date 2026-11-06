import { describe, expect, it } from 'vitest';
import {
  fieldProblemsOf,
  nonNegativeMoneyField,
  renderSmsTemplate,
  SMS_EVENTS,
  SmsEvent,
  smsSettingsUpdateSchema,
  smsUnitsOf,
  smsVariablesIn,
  smsWithName,
  takaFigure,
} from '@lytronix/validators';
import { smsEventKey } from '../src/modules/sms-events/services/sms-event-queue';

// SMS-03, SMS-09, SMS-10, SMS-16, SMS-19 (Slice 7.2): the templates' pure parts, shared by the server and the screens.
describe('SMS templates', () => {
  const values = {
    order_number: '261106-0017',
    amount: '1,250',
    tracking_link: 'https://rahimfashion.lytro.app/track/AB3XK9QZ',
  };

  it('SMS-03, the read: six defaults are one unit with a typical shop name; shipped is two, for its link', () => {
    for (const shop of ['রহিম ফ্যাশন', 'Rahim Fashion']) {
      const units = Object.values(SmsEvent).map((event) =>
        smsUnitsOf(smsWithName(shop, renderSmsTemplate(SMS_EVENTS[event].template, values)), 67),
      );
      expect(units).toEqual([1, 1, 2, 1, 1, 1, 1]);
    }
    expect(Object.values(SmsEvent).filter((event) => SMS_EVENTS[event].on)).toEqual([
      SmsEvent.OrderPlaced,
      SmsEvent.PaymentVerified,
      SmsEvent.OrderShipped,
      SmsEvent.OrderCancelled,
    ]);
  });

  it('fills what it knows, leaves no gap or hanging colon for an empty one, and keeps an unknown name', () => {
    expect(renderSmsTemplate('অর্ডার {order_number} পাঠানো হয়েছে: {tracking_link}', values)).toBe(
      'অর্ডার 261106-0017 পাঠানো হয়েছে: https://rahimfashion.lytro.app/track/AB3XK9QZ',
    );
    expect(renderSmsTemplate('অর্ডার {order_number} পাঠানো হয়েছে: {tracking_link}', {})).toBe(
      'অর্ডার পাঠানো হয়েছে',
    );
    expect(renderSmsTemplate('{customer_name}, অর্ডার {order_number}', { order_number: '1' })).toBe(
      ', অর্ডার 1',
    );
    expect(smsVariablesIn('{a} {order_number} {}')).toEqual(['a', 'order_number', '']);
  });

  it('SMS-09: counts characters, whatever the language, at least one unit', () => {
    expect(smsUnitsOf('', 67)).toBe(1);
    expect(smsUnitsOf('অ'.repeat(67), 67)).toBe(1);
    expect(smsUnitsOf('অ'.repeat(68), 67)).toBe(2);
  });

  it('SMS-10: a template keeps {order_number} and names only its own variables', () => {
    const problems = (input: unknown) => {
      const parsed = smsSettingsUpdateSchema.safeParse(input);
      return parsed.success ? [] : fieldProblemsOf(parsed.error).map((p) => [p.field, p.problem]);
    };
    expect(problems({ templates: { order_placed: 'পেয়েছি' } })).toEqual([
      ['templates.order_placed', 'missing_variable'],
    ]);
    expect(
      problems({ templates: { payment_to_verify: '{order_number} {tracking_link}' } }),
    ).toEqual([['templates.payment_to_verify', 'unknown_variable']]);
    expect(problems({ templates: { order_shipped: '{order_number}: {tracking_link}' } })).toEqual(
      [],
    );
    expect(problems({})).toEqual([['', 'nothing_to_change']]);
    expect(problems({ monthlySpendCap: 0.5 })).toEqual([['monthlySpendCap', 'too_small']]);
    expect(problems({ smsName: null, monthlySpendCap: null })).toEqual([]);
  });

  it('a taka amount is written the Bangladeshi way, without empty paisa', () => {
    expect(['1250.00', '125000.50', '999', '12345678.5', '0.00'].map(takaFigure)).toEqual([
      '1,250',
      '1,25,000.50',
      '999',
      '1,23,45,678.50',
      '0',
    ]);
  });

  it('a two-decimal amount is taken though a double writes it a hair off (1.1 * 100 is 110.00000000000001)', () => {
    for (const value of [1.1, 0.29, 50, 12.5]) {
      expect(nonNegativeMoneyField.safeParse(value).success, String(value)).toBe(true);
    }
    expect(nonNegativeMoneyField.safeParse(1.005).success).toBe(false);
  });

  it("each job's key is a UUID, the same for the same event and its own for another payment", () => {
    const job = { tenantId: 't', orderId: 'o', events: [SmsEvent.PaymentVerified], ref: 'p1' };
    expect(smsEventKey(job)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(smsEventKey(job)).toBe(smsEventKey({ ...job }));
    expect(smsEventKey(job)).not.toBe(smsEventKey({ ...job, ref: 'p2' }));
  });
});
