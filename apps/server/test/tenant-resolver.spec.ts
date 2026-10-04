import { EdgeSecret } from '../src/common/guards/edge-secret';
import { HostClassifier } from '../src/modules/tenancy/services/host-classifier';
import { SlugFormat } from '../src/modules/tenancy/services/slug-format';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { TenantState } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { TenantCache } from '../src/modules/tenancy/services/tenant-cache';
import { type CachedTenant } from '../src/modules/tenancy/types/cached-tenant';
import { TenantGuard, EDGE_HEADER, type TenantRequest } from '../src/common/guards/tenant.guard';
import { TenantResolver } from '../src/modules/tenancy/services/tenant-resolver.service';
import { type TenantDirectory } from '../src/modules/tenancy/ports/tenant-directory';

const SECRET = 'e'.repeat(32);

const shops: Record<string, CachedTenant> = {
  'fashion-house': {
    id: 'shop-1',
    slug: 'fashion-house',
    state: TenantState.Active,
    suspendedAt: null,
  },
  'closed-shop': {
    id: 'shop-2',
    slug: 'closed-shop',
    state: TenantState.Archived,
    suspendedAt: null,
  },
  'suspended-shop': {
    id: 'shop-4',
    slug: 'suspended-shop',
    state: TenantState.Active,
    suspendedAt: new Date(),
  },
  'readonly-shop': {
    id: 'shop-3',
    slug: 'readonly-shop',
    state: TenantState.ReadOnly,
    suspendedAt: null,
  },
};
const customDomains: Record<string, CachedTenant> = {
  'www.fashionhouse.com': {
    id: 'shop-1',
    slug: 'fashion-house',
    state: TenantState.Active,
    suspendedAt: null,
  },
};

function fakeDirectory() {
  const calls = { slug: 0, domain: 0 };
  const directory: TenantDirectory = {
    findBySlug: (slug) => {
      calls.slug += 1;
      return Promise.resolve(shops[slug] ?? null);
    },
    findByActiveDomain: (hostname) => {
      calls.domain += 1;
      return Promise.resolve(customDomains[hostname] ?? null);
    },
  };
  return { directory, calls };
}

function resolverWith(now = () => 0) {
  const { directory, calls } = fakeDirectory();
  const cache = new TenantCache(60_000, now);
  return {
    resolver: new TenantResolver(
      directory,
      cache,
      new HostClassifier('localhost', new SlugFormat()),
    ),
    calls,
    cache,
  };
}

describe('TenantResolver (TEN-7a, TEN-24)', () => {
  it('resolves a shop from its subdomain', async () => {
    const { resolver } = resolverWith();
    expect(await resolver.resolve('fashion-house.localhost:3001')).toEqual({
      outcome: 'tenant',
      tenant: shops['fashion-house'],
    });
  });

  it('resolves a shop from a verified custom domain', async () => {
    const { resolver } = resolverWith();
    expect(await resolver.resolve('WWW.fashionhouse.com')).toEqual({
      outcome: 'tenant',
      tenant: customDomains['www.fashionhouse.com'],
    });
  });

  it('returns not_found for an unknown host without falling back to any shop', async () => {
    const { resolver } = resolverWith();
    expect(await resolver.resolve('nobody.localhost')).toEqual({ outcome: 'not_found' });
    expect(await resolver.resolve('unknown.example.com')).toEqual({ outcome: 'not_found' });
  });

  it('returns not_found for the bare platform domain, malformed hosts and a missing host', async () => {
    const { resolver, calls } = resolverWith();
    expect(await resolver.resolve('localhost')).toEqual({ outcome: 'not_found' });
    expect(await resolver.resolve('a.b.localhost')).toEqual({ outcome: 'not_found' });
    expect(await resolver.resolve(undefined)).toEqual({ outcome: 'not_found' });
    expect(calls.slug + calls.domain).toBe(0);
  });

  it('returns not_found for a reserved label, because no shop can hold it', async () => {
    const { resolver } = resolverWith();
    expect(await resolver.resolve('www.localhost')).toEqual({ outcome: 'not_found' });
  });

  it('reports a closed shop with its id but without a public tenant result', async () => {
    const { resolver } = resolverWith();
    expect(await resolver.resolve('closed-shop.localhost')).toEqual({
      outcome: 'closed',
      tenant: shops['closed-shop'],
    });
    expect((await resolver.resolve('readonly-shop.localhost')).outcome).toBe('closed');
  });

  it('serves a repeat request from the cache, without a second database lookup', async () => {
    const { resolver, calls } = resolverWith();
    await resolver.resolve('fashion-house.localhost');
    await resolver.resolve('fashion-house.localhost');
    expect(calls.slug).toBe(1);
  });

  it('does not cache a miss, so a shop created later is found', async () => {
    const { resolver, calls } = resolverWith();
    await resolver.resolve('later.localhost');
    await resolver.resolve('later.localhost');
    expect(calls.slug).toBe(2);
  });
});

describe('EdgeSecret.matches (R3)', () => {
  it('accepts the exact secret and refuses anything else', () => {
    expect(new EdgeSecret(SECRET).matches(SECRET)).toBe(true);
    expect(new EdgeSecret(SECRET).matches(`${SECRET}x`)).toBe(false);
    expect(new EdgeSecret(SECRET).matches(undefined)).toBe(false);
    expect(new EdgeSecret(SECRET).matches(['a', 'b'])).toBe(false);
  });
});

function contextFor(request: TenantRequest, skip = false) {
  const reflector = { getAllAndOverride: () => skip } as unknown as Reflector;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { reflector, context };
}

describe('TenantGuard (TEN-7a, R3, R6)', () => {
  it('attaches the resolved shop to the request', async () => {
    const { resolver } = resolverWith();
    const request: TenantRequest = { headers: { host: 'fashion-house.localhost' } };
    const { reflector, context } = contextFor(request);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(undefined));
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenant).toEqual(shops['fashion-house']);
  });

  it('refuses an unknown host with a generic not-found', async () => {
    const { resolver } = resolverWith();
    const request: TenantRequest = { headers: { host: 'nobody.localhost' } };
    const { reflector, context } = contextFor(request);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(undefined));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(request.tenant).toBeUndefined();
  });

  it('refuses a closed shop without attaching its data to the request', async () => {
    const { resolver } = resolverWith();
    const request: TenantRequest = { headers: { host: 'closed-shop.localhost' } };
    const { reflector, context } = contextFor(request);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(undefined));
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'tenant_offline' });
    expect(request.tenant).toBeUndefined();
  });

  it('ignores any tenant value the client sends in a header or body', async () => {
    const { resolver } = resolverWith();
    const request = {
      headers: { host: 'fashion-house.localhost', 'x-tenant-id': 'shop-2' },
      body: { tenant_id: 'shop-2' },
    } as TenantRequest;
    const { reflector, context } = contextFor(request);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(undefined));
    await guard.canActivate(context);
    expect(request.tenant?.id).toBe('shop-1');
  });

  it('refuses a request without the edge secret when one is configured', async () => {
    const { resolver } = resolverWith();
    const request: TenantRequest = { headers: { host: 'fashion-house.localhost' } };
    const { reflector, context } = contextFor(request);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(SECRET));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a request carrying the edge secret', async () => {
    const { resolver } = resolverWith();
    const request: TenantRequest = {
      headers: { host: 'fashion-house.localhost', [EDGE_HEADER]: SECRET },
    };
    const { reflector, context } = contextFor(request);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(SECRET));
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('lets a route marked SkipTenant through without a host, as /health needs (R6)', async () => {
    const { resolver } = resolverWith();
    const request: TenantRequest = { headers: {} };
    const { reflector, context } = contextFor(request, true);
    const guard = new TenantGuard(resolver, reflector, new EdgeSecret(SECRET));
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.tenant).toBeUndefined();
  });
});

describe('suspension closes the public side (LIF-24)', () => {
  it('reports a suspended shop as closed, even when its state is active', async () => {
    const { resolver } = resolverWith();
    expect((await resolver.resolve('suspended-shop.localhost')).outcome).toBe('closed');
  });
});
