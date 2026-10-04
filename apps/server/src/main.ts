import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { EnvironmentParser } from './config/env';

// The process entry point: loads the validated settings, builds the application and starts listening.
class Application {
  async start(): Promise<void> {
    const env = new EnvironmentParser().parse();
    const app = await NestFactory.create(AppModule);
    await app.listen(env.PORT, env.HOST);
  }
}

void new Application().start();
