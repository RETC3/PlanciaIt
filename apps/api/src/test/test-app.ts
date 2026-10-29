import 'reflect-metadata';
import { Controller, Get, type INestApplication, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { createDatabase, DEV_DATABASE_URL, runMigrations, type Database } from '@planciait/db';
import { AppModule } from '../app.module.js';
import { configureHttp } from '../common/http-setup.js';
import { APP_CONFIG, loadConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';

/** A route with no access decorator: requires a fully authenticated session. */
@Controller('protected')
export class ProtectedTestController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

export interface TestApp {
  app: INestApplication;
  url: string;
  database: Database;
  close: () => Promise<void>;
}

let counter = 0;

/**
 * Starts the full API against a fresh, migrated PostgreSQL database, dropped
 * on close. Needs the dev database server (deploy/docker-compose.dev.yml) or
 * TEST_DATABASE_URL pointing at a server where the user may create databases.
 */
export async function startTestApp(controllers: Type[] = []): Promise<TestApp> {
  const serverUrl = process.env.TEST_DATABASE_URL ?? DEV_DATABASE_URL;
  const name = `planciait_test_${process.pid}_${Date.now()}_${counter++}`;
  const admin = createDatabase(serverUrl);
  await admin.pool.query(`CREATE DATABASE "${name}"`);

  const databaseUrl = new URL(serverUrl);
  databaseUrl.pathname = `/${name}`;
  await runMigrations(databaseUrl.toString());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers })
    .overrideProvider(APP_CONFIG)
    .useValue({ ...loadConfig({ NODE_ENV: 'test' }), databaseUrl: databaseUrl.toString() })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');

  return {
    app,
    url: await app.getUrl(),
    database: app.get<Database>(DATABASE),
    close: async () => {
      await app.close();
      await admin.pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.pool.end();
    },
  };
}
