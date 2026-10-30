import { describe, expect, it } from 'vitest';
import {
  domainRecordName,
  domainTwinOf,
  domainTxtValue,
  domainUsesCname,
  normalizeDomain,
} from '../src';

// TEN-09, TEN-11 (Slice 13): what a seller types becomes one hostname, and the records its page shows are named the way
// a domain seller asks for them.

describe('normalizeDomain', () => {
  it.each([
    ['megh.com', 'megh.com'],
    ['  MEGH.com ', 'megh.com'],
    ['https://www.megh.com/', 'www.megh.com'],
    ['http://megh.com:8080/shop?x=1#top', 'megh.com'],
    ['megh.com.', 'megh.com'],
    ['megh.com.bd', 'megh.com.bd'],
    ['shop-1.megh.com', 'shop-1.megh.com'],
    ['xn--45be4a8a4an7e.xn--54b7fta0cc', 'xn--45be4a8a4an7e.xn--54b7fta0cc'],
  ])('reads %j as %s', (typed, host) => {
    expect(normalizeDomain(typed)).toBe(host);
  });

  it.each([
    '',
    'megh',
    'https://megh',
    '203.0.113.10',
    'megh .com',
    '-megh.com',
    'megh-.com',
    'megh_shop.com',
    'megh.c',
    'মেঘ.com',
    `${'a'.repeat(64)}.com`,
    `${'a.'.repeat(127)}com`,
  ])('refuses %j', (typed) => {
    expect(normalizeDomain(typed)).toBeNull();
  });
});

describe('the twin and the records', () => {
  it('pairs a domain with its www name, both ways', () => {
    expect(domainTwinOf('megh.com')).toBe('www.megh.com');
    expect(domainTwinOf('www.megh.com')).toBe('megh.com');
    expect(domainTwinOf('megh.com.bd')).toBe('www.megh.com.bd');
  });

  it('shows the CNAME for a www name only', () => {
    expect(domainUsesCname('www.megh.com')).toBe(true);
    expect(domainUsesCname('megh.com')).toBe(false);
    expect(domainUsesCname('shop.megh.com')).toBe(false);
  });

  it('names each record relative to the domain bought', () => {
    expect(domainRecordName('megh.com')).toBe('@');
    expect(domainRecordName('www.megh.com')).toBe('www');
    expect(domainRecordName('_lytro.megh.com')).toBe('_lytro');
    expect(domainRecordName('_lytro.shop.megh.com')).toBe('_lytro.shop');
    expect(domainRecordName('megh.com.bd')).toBe('@');
    expect(domainRecordName('www.megh.com.bd')).toBe('www');
    expect(domainRecordName('www.megh.co.uk')).toBe('www');
    expect(domainRecordName('www.megh.co')).toBe('www');
  });

  it('names the shop in the TXT value', () => {
    expect(domainTxtValue('megh')).toBe('lytro=megh');
  });
});
