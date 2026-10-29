import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureHttp } from './common/http-setup.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureHttp(app);
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(APP_CONFIG);
  app.set('trust proxy', config.trustProxy);
  await app.listen(config.port, config.host);
  Logger.log(`API listening on ${config.host}:${config.port}`, 'Bootstrap');
}

void bootstrap();
