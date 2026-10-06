import { describe, expect, it } from 'vitest';
import { ClientIp, CLIENT_IP_HEADER } from '../src/common/client-ip';
import { EdgeSecret } from '../src/common/guards/edge-secret';
import { EDGE_HEADER } from '../src/common/guards/tenant.guard';

// Client address behind the edge (R3): the forwarded address counts only with the edge secret.
const SECRET = 'e'.repeat(32);

describe('the client address (R3, SEC-14)', () => {
  it('takes the forwarded address when the request carries the edge secret', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET));
    const request = {
      headers: { [EDGE_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.7' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('203.0.113.7');
  });

  it('ignores the forwarded address without the edge secret', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET));
    const request = { headers: { [CLIENT_IP_HEADER]: '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('ignores the forwarded address when no edge secret is configured', () => {
    const resolver = new ClientIp(new EdgeSecret(undefined));
    const request = { headers: { [CLIENT_IP_HEADER]: '203.0.113.7' }, ip: '10.0.0.1' };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('falls back to the socket address when the forwarded value is not an IP', () => {
    const resolver = new ClientIp(new EdgeSecret(SECRET));
    const request = {
      headers: { [EDGE_HEADER]: SECRET, [CLIENT_IP_HEADER]: 'not-an-address' },
      ip: '10.0.0.1',
    };
    expect(resolver.resolve(request)).toBe('10.0.0.1');
  });

  it('returns null when neither source gives a valid address', () => {
    const resolver = new ClientIp(new EdgeSecret(undefined));
    expect(resolver.resolve({ headers: {} })).toBeNull();
  });
});
