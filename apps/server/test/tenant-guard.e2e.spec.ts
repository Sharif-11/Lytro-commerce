import { EdgeSecret } from '../src/common/guards/edge-secret';
import { HostClassifier } from '../src/modules/tenancy/services/host-classifier';
import { SlugFormat } from '../src/modules/tenancy/services/slug-format';
import { Controller, Get, type INestApplication, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthController } from '../src/modules/health/health.controller';
import { TenantCache } from '../src/modules/tenancy/services/tenant-cache';
import { type CachedTenant } from '../src/modules/tenancy/types/cached-tenant';
import { TenantState } from '@lytronix/validators';
import { TenantGuard, EDGE_HEADER, type TenantRequest } from '../src/common/guards/tenant.guard';
import { TenantResolver } from '../src/modules/tenancy/services/tenant-resolver.service';
import { type TenantDirectory } from '../src/modules/tenancy/ports/tenant-directory';
import {
  PLATFORM_DOMAIN,
  TENANT_DIRECTORY,
  TRUSTED_EDGE_SECRET,
} from '../src/modules/tenancy/tokens';

// Runs the real Nest pipeline over HTTP: guard, resolver and routes. Unit tests cover the rules;
// this covers that the guard is actually applied to a route.
const SECRET = 'e'.repeat(32);

const shops: Record<string, CachedTenant> = {
  'fashion-house': { id: 'shop-1', slug: 'fashion-house', state: TenantState.Active },
  'closed-shop': { id: 'shop-2', slug: 'closed-shop', state: TenantState.Archived },
};

const directory: TenantDirectory = {
  findBySlug: (slug) => Promise.resolve(shops[slug] ?? null),
  findByActiveDomain: () => Promise.resolve(null),
};

@Controller('probe')
class ProbeController {
  @Get()
  read(@Req() req: TenantRequest): { tenantId: string | undefined } {
    return { tenantId: req.tenant?.id };
  }
}

function send(
  port: number,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

let app: INestApplication;
let port: number;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController, HealthController],
    providers: [
      { provide: TENANT_DIRECTORY, useValue: directory },
      { provide: TenantCache, useFactory: () => new TenantCache() },
      { provide: PLATFORM_DOMAIN, useValue: 'localhost' },
      { provide: TRUSTED_EDGE_SECRET, useValue: SECRET },
      SlugFormat,
      HostClassifier,
      EdgeSecret,
      TenantResolver,
      { provide: APP_GUARD, useClass: TenantGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await app.close();
});

const edge = { [EDGE_HEADER]: SECRET };

describe('tenant guard over HTTP (TEN-7a, R3, R6)', () => {
  it('serves a protected route for a known shop and attaches that shop', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'fashion-house.localhost' });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ tenantId: 'shop-1' });
  });

  it('answers an unknown host with 404 and no shop data', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'nobody.localhost' });
    expect(response.status).toBe(404);
    expect(response.body).not.toContain('shop-');
  });

  it('answers a closed shop with 503 and no shop data', async () => {
    const response = await send(port, '/probe', { ...edge, host: 'closed-shop.localhost' });
    expect(response.status).toBe(503);
    expect(response.body).not.toContain('shop-2');
  });

  it('ignores a tenant id sent by the client', async () => {
    const response = await send(port, '/probe', {
      ...edge,
      host: 'fashion-house.localhost',
      'x-tenant-id': 'shop-2',
    });
    expect(JSON.parse(response.body)).toEqual({ tenantId: 'shop-1' });
  });

  it('refuses a request that bypassed the trusted edge', async () => {
    const response = await send(port, '/probe', { host: 'fashion-house.localhost' });
    expect(response.status).toBe(403);
  });

  it('keeps /health open without a host, as load balancers need (R6)', async () => {
    const response = await send(port, '/health', {});
    expect(response.status).toBe(200);
  });
});
