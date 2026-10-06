import { describe, expect, it } from 'vitest';
import { ClientIp } from '../src/common/client-ip';
import { EdgeSecret } from '../src/common/guards/edge-secret';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';

// Client address behind the edge (R3): the forwarded address counts only with the edge secret.
const SECRET = 'e'.repeat(32);
const CLOUDFLARE = { CLIENT_IP_HEADER: 'cf-connecting-ip' };

describe('the client address (R3, D14)', () => {
  it('takes the forwarded address when the request carries the edge secret', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), CLOUDFLARE);
    const request = {
      headers: { [EDGE_HEADER]: SECRET, 'cf-connecting-ip': '203.0.113.7' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('203.0.113.7');
  });

  it('ignores the forwarded address without the edge secret', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), CLOUDFLARE);
    const request = { headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('ignores the forwarded address when no edge secret is configured', () => {
    const resolver = new ClientIp(new EdgeSecret(undefined), CLOUDFLARE);
    const request = { headers: { 'cf-connecting-ip': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('falls back to the socket address when the forwarded value is not an IP', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), CLOUDFLARE);
    const request = {
      headers: { [EDGE_HEADER]: SECRET, 'cf-connecting-ip': 'not-an-address' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('reads the configured header, and takes the first address of an X-Forwarded-For list', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { CLIENT_IP_HEADER: 'x-forwarded-for' });
    const request = {
      headers: { [EDGE_HEADER]: SECRET, 'x-forwarded-for': '198.51.100.4, 10.0.0.9' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('198.51.100.4');
  });

  it('does not read the Cloudflare header when another header is configured', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { CLIENT_IP_HEADER: 'x-forwarded-for' });
    const request = {
      headers: { [EDGE_HEADER]: SECRET, 'cf-connecting-ip': '203.0.113.7' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('returns null when neither source gives a valid address', () => {
    const resolver = new ClientIp(new EdgeSecret(undefined), CLOUDFLARE);
    expect(resolver.resolve({ headers: {} })).toBeNull();
  });
});
