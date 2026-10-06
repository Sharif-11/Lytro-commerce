import { describe, expect, it } from 'vitest';
import { ClientIp } from '../src/common/client-ip';
import { EdgeSecret } from '../src/common/guards/edge-secret';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';

// Client address behind the edge (D14): the forwarded address counts only with the edge secret, and a list is read
// from the position the trusted proxies added.
const SECRET = 'e'.repeat(32);
const LIST = {
  CLIENT_IP_HEADER: 'x-forwarded-for',
  CLIENT_IP_FORMAT: 'list',
  TRUSTED_PROXY_HOPS: 1,
} as const;

const withEdge = { [EDGE_HEADER]: SECRET };

describe('the client address (D14)', () => {
  it('reads the single entry of a list when one trusted proxy is in front', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST });
    const request = { headers: { ...withEdge, 'x-forwarded-for': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('203.0.113.7');
  });

  it('ignores entries a client forged in front of the one the trusted proxy added', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST });
    const request = {
      headers: { ...withEdge, 'x-forwarded-for': '1.1.1.1, 203.0.113.7' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('203.0.113.7');
  });

  it('takes the entry TRUSTED_PROXY_HOPS places from the end', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST, TRUSTED_PROXY_HOPS: 2 });
    const request = {
      headers: { ...withEdge, 'x-forwarded-for': '198.51.100.4, 203.0.113.7, 10.0.0.9' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('203.0.113.7');
  });

  it('falls back to the socket address when the list is shorter than the hop count', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST, TRUSTED_PROXY_HOPS: 3 });
    const request = { headers: { ...withEdge, 'x-forwarded-for': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('reads a single-value header as one address', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), {
      CLIENT_IP_HEADER: 'cf-connecting-ip',
      CLIENT_IP_FORMAT: 'single',
      TRUSTED_PROXY_HOPS: 1,
    });
    const request = { headers: { ...withEdge, 'cf-connecting-ip': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('203.0.113.7');
  });

  it('ignores the header without the edge secret', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST });
    const request = { headers: { 'x-forwarded-for': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('ignores the header when no edge secret is configured', () => {
    const resolver = new ClientIp(new EdgeSecret(undefined), { ...LIST });
    const request = { headers: { 'x-forwarded-for': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('falls back to the socket address when the chosen entry is not an IP', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST });
    const request = {
      headers: { ...withEdge, 'x-forwarded-for': 'not-an-address' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('reads only the configured header', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET), { ...LIST });
    const request = { headers: { ...withEdge, 'cf-connecting-ip': '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('returns null when neither source gives a valid address', () => {
    const resolver = new ClientIp(new EdgeSecret(undefined), { ...LIST });
    expect(resolver.resolve({ headers: {} })).toBeNull();
  });
});
