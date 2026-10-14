import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { setupGracefulShutdown } from '@tygra/nestjs-graceful-shutdown';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app/app.module';
import { EnvironmentParser } from './config/env';
import { UNVERSIONED_ROUTES } from './common/unversioned-routes';

// The process entry point: loads the validated settings, builds the application and starts listening.
class Application {
  async start(): Promise<void> {
    const env = new EnvironmentParser().parse();
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api/v1', { exclude: UNVERSIONED_ROUTES });

    // API docs, generated from the same Zod DTOs every route already validates request/response against
    // (nestjs-zod's createZodDto) -- one definition per shape, never a hand-maintained second copy.
    const config = new DocumentBuilder()
      .setTitle('Lytronix API')
      .setDescription('API documentation for the Lytronix platform')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    const cleanedDocument = cleanupOpenApiDoc(document);
    app.use('/reference', apiReference({ content: cleanedDocument }));
    // Scalar's page loads its UI bundle from a CDN at runtime; swagger-ui-dist is bundled into this
    // server instead, so /swagger keeps working with no outbound network call -- a CDN-independent
    // fallback to isolate a rendering problem from a spec-generation one.
    SwaggerModule.setup('swagger', app, cleanedDocument);

    // On SIGTERM/SIGINT (every container stop/restart/deploy): stop accepting new requests, let
    // in-flight ones finish, run every onModuleDestroy hook (DatabaseService's pool, PgBossClient,
    // the mail/SMS workers), then force-close any still-open keep-alive socket after 10s so a stuck
    // shutdown never blocks a deploy. GracefulShutdownModule (app.module.ts) enables the shutdown
    // hooks itself -- calling enableShutdownHooks() here too would double-register them.
    setupGracefulShutdown({ app });

    await app.listen(env.PORT, env.HOST);
  }
}

void new Application().start();
