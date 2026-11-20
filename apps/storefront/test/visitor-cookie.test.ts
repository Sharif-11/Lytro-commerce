import { describe, expect, it } from 'vitest';
import {
  newVisitorId,
  parseVisitor,
  VISITOR_COOKIE_MAX_AGE,
  visitorCookieValue,
  visitorFromCookies,
} from '../src/lib/account/visitor-cookie';

describe("the shopper's mark (RTE-06 as amended, load fix 2)", () => {
  it('makes 128 random bits as 22 base64url characters, a new one each time', () => {
    const marks = new Set(Array.from({ length: 200 }, () => newVisitorId()));
    expect(marks.size).toBe(200);
    for (const mark of marks) expect(mark).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('takes only a well-formed mark, so nothing else ever names a shopper to the server', () => {
    const mark = newVisitorId();
    expect(parseVisitor(mark)).toBe(mark);
    expect(parseVisitor(undefined)).toBeNull();
    expect(parseVisitor('')).toBeNull();
    expect(parseVisitor('short')).toBeNull();
    expect(parseVisitor(`${mark}x`)).toBeNull();
    expect(parseVisitor('Vb3sQ0mX5n+kP7rT2yW9aA')).toBeNull();
    expect(parseVisitor('Vb3sQ0mX5n kP7rT2yW9aA')).toBeNull();
    expect(parseVisitor('Vb3sQ0mX5n_kP7rT2yW9a=')).toBeNull();
  });

  it('is kept 400 days on the whole shop, secure wherever the page came over https', () => {
    expect(VISITOR_COOKIE_MAX_AGE).toBe(34_560_000);
    expect(visitorCookieValue('Vb3sQ0mX5n_kP7rT2yW9aA', true)).toBe(
      'lytro-visitor=Vb3sQ0mX5n_kP7rT2yW9aA; Path=/; Max-Age=34560000; SameSite=Lax; Secure',
    );
    expect(visitorCookieValue('Vb3sQ0mX5n_kP7rT2yW9aA', false)).toBe(
      'lytro-visitor=Vb3sQ0mX5n_kP7rT2yW9aA; Path=/; Max-Age=34560000; SameSite=Lax',
    );
  });

  it("finds the mark among a browser's cookies, and none when it is missing or spoiled", () => {
    expect(visitorFromCookies('lytro-lang=en; lytro-visitor=Vb3sQ0mX5n_kP7rT2yW9aA; x=1')).toBe(
      'Vb3sQ0mX5n_kP7rT2yW9aA',
    );
    expect(visitorFromCookies('lytro-visitor=Vb3sQ0mX5n_kP7rT2yW9aA')).toBe(
      'Vb3sQ0mX5n_kP7rT2yW9aA',
    );
    expect(visitorFromCookies('lytro-lang=en')).toBeNull();
    expect(visitorFromCookies('')).toBeNull();
    expect(visitorFromCookies('lytro-visitor=nope')).toBeNull();
    expect(visitorFromCookies('xlytro-visitor=Vb3sQ0mX5n_kP7rT2yW9aA')).toBeNull();
  });
});
