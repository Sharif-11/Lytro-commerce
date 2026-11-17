import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * The API docs, generated from the same Zod DTOs every route already validates request and response against
 * (nestjs-zod's createZodDto) -- one definition per shape, never a hand-maintained second copy. Built at start, so a
 * schema Zod can't write as JSON Schema stops the server starting; a test builds them the same way (api-docs.e2e).
 */
export class ApiDocs {
  build(app: INestApplication): OpenAPIObject {
    const config = new DocumentBuilder()
      .setTitle('Lytronix API')
      .setDescription('API documentation for the Lytronix platform')
      .setVersion('1.0')
      .build();
    return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  }

  mount(app: INestApplication, document: OpenAPIObject): void {
    app.use('/reference', apiReference({ content: document }));
    // Scalar's page loads its UI bundle from a CDN at runtime; swagger-ui-dist is bundled into this server instead,
    // so /swagger keeps working with no outbound network call -- a CDN-independent fallback to isolate a rendering
    // problem from a spec-generation one.
    SwaggerModule.setup('swagger', app, document);
  }
}
