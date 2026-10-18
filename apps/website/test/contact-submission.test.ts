import { describe, expect, it } from 'vitest';
import {
  ContactSubmission,
  ContactValidator,
  type ContactDelivery,
  type ContactMessage,
} from '../src/lib/contact/contact-submission';

const good = {
  topic: 'setup',
  name: 'Rahim',
  phone: '+880 1712-345678',
  pageLink: '',
  message: 'Cannot pair the listener.',
};

const validator = new ContactValidator();

describe('ContactValidator', () => {
  it('accepts a Bangladeshi mobile number with or without the country code', () => {
    expect(validator.validate(good)).toHaveProperty('message');
    expect(validator.validate({ ...good, phone: '01712345678' })).toHaveProperty('message');
    expect(validator.validate({ ...good, phone: '8801712345678' })).toHaveProperty('message');
  });

  it('names the first problem on each field', () => {
    const result = validator.validate({
      topic: 'x',
      name: ' ',
      phone: '12345',
      pageLink: '',
      message: '',
    });
    expect(result).toEqual({
      problems: { topic: 'required', name: 'required', phone: 'invalid', message: 'required' },
    });
  });

  it('strips spaces and hyphens from the phone and blanks from the link', () => {
    const result = validator.validate({ ...good, pageLink: '  facebook.com/rahim  ' });
    expect('message' in result && result.message.phone).toBe('+8801712345678');
    expect('message' in result && result.message.pageLink).toBe('facebook.com/rahim');
  });
});

describe('ContactSubmission', () => {
  it('reports unavailable instead of pretending to send when no delivery is configured', async () => {
    const result = await new ContactSubmission(validator, null).submit(good);
    expect(result).toEqual({ status: 'unavailable' });
  });

  it('delivers a valid message and reports the outcome', async () => {
    const delivered: ContactMessage[] = [];
    const delivery: ContactDelivery = {
      deliver: (message) => {
        delivered.push(message);
        return Promise.resolve(true);
      },
    };
    const result = await new ContactSubmission(validator, delivery).submit(good);
    expect(result).toEqual({ status: 'sent' });
    expect(delivered[0]?.topic).toBe('setup');
  });

  it('does not deliver an invalid message', async () => {
    let calls = 0;
    const delivery: ContactDelivery = {
      deliver: () => {
        calls += 1;
        return Promise.resolve(true);
      },
    };
    const result = await new ContactSubmission(validator, delivery).submit({
      ...good,
      message: '',
    });
    expect(result.status).toBe('invalid');
    expect(calls).toBe(0);
  });
});
