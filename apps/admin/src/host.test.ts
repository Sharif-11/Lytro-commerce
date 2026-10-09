import { describe, expect, it } from 'vitest';
import { isOperatorHost } from './host';

function setHostname(hostname: string): void {
  Object.defineProperty(window, 'location', {
    value: Object.assign(new URL(window.location.href), { hostname }),
    writable: true,
  });
}

describe('isOperatorHost', () => {
  it('is false for the tenant-facing host', () => {
    setHostname('lytro.com');
    expect(isOperatorHost()).toBe(false);
  });

  it('is true for the default operator host', () => {
    setHostname('admin.lytro.com');
    expect(isOperatorHost()).toBe(true);
  });

  it('is false for a tenant shop subdomain', () => {
    setHostname('acme.lytro.com');
    expect(isOperatorHost()).toBe(false);
  });
});
