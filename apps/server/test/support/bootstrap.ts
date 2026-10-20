import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModule } from '@nestjs/testing';
import type { AddressInfo } from 'node:net';
import { HttpSetup } from '../../src/app/http-setup';

/** Starts the compiled testing module the same way main.ts starts the real one (HttpSetup: the /api/v1 prefix
 * and the body limit), listening on an ephemeral port, and returns the app and the port the e2e specs call. */
export async function listenOn(
  moduleRef: TestingModule,
  options: { publicApiHost?: boolean } = {},
): Promise<{ app: INestApplication; port: number }> {
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  new HttpSetup().apply(app, options);
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  return { app, port };
}
