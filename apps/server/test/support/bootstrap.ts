import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { UNVERSIONED_ROUTES } from '../../src/common/unversioned-routes';

/** Starts the compiled testing module the same way main.ts starts the real one (API-14's /api/v1 prefix),
 * listening on an ephemeral port, and returns both the app and the port the e2e specs call against. */
export async function listenOn(
  moduleRef: TestingModule,
): Promise<{ app: INestApplication; port: number }> {
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1', { exclude: UNVERSIONED_ROUTES });
  await app.listen(0, '127.0.0.1');
  const port = ((app.getHttpServer() as Server).address() as AddressInfo).port;
  return { app, port };
}
