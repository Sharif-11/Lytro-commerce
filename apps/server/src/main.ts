import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { setupGracefulShutdown } from '@tygra/nestjs-graceful-shutdown';
import { ApiDocs } from './app/api-docs';
import { AppModule } from './app/app.module';
import { HttpSetup } from './app/http-setup';
import { EnvironmentParser } from './config/env';

// The process entry point: loads the validated settings, builds the application and starts listening.
class Application {
  async start(): Promise<void> {
    const env = new EnvironmentParser().parse();
    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      // CRR-11: a courier's signature is over the body exactly as it arrived.
      rawBody: true,
      // D9-20 (Slice 9.6): Nest's start-up lines wait for the app's own logger (HttpSetup), so they're JSON too.
      bufferLogs: true,
    });
    new HttpSetup().apply(app);

    const docs = new ApiDocs();
    docs.mount(app, docs.build(app));

    // On SIGTERM/SIGINT (every container stop/restart/deploy): stop accepting new requests, let
    // in-flight ones finish, run every onModuleDestroy hook (PgBossClient, the mail/SMS workers),
    // then RequestQuota's last flush (beforeApplicationShutdown), then close DatabaseService's pool
    // (onApplicationShutdown, the last step), then force-close any still-open keep-alive socket
    // after 10s so a stuck shutdown never blocks a deploy. GracefulShutdownModule (app.module.ts) enables the shutdown
    // hooks itself -- calling enableShutdownHooks() here too would double-register them.
    setupGracefulShutdown({ app });

    await app.listen(env.PORT, env.HOST);
  }
}

void new Application().start();
