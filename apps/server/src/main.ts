import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { EnvironmentParser } from './config/env';

async function bootstrap(): Promise<void> {
  const env = new EnvironmentParser().parse();
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT, env.HOST);
}

void bootstrap();
