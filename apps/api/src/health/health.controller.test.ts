import 'reflect-metadata';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@planciait/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.module.js';

@Controller('unmarked')
class UnmarkedController {
  @Get()
  get(): string {
    return 'should never be reachable';
  }
}

describe('GET /health', () => {
  let app: INestApplication | undefined;

  async function startApp(execute: () => Promise<unknown>): Promise<string> {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [UnmarkedController],
    })
      .overrideProvider(DATABASE)
      .useValue({ db: { execute }, pool: { end: vi.fn() } })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    return app.getUrl();
  }

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns 200 when the database is reachable', async () => {
    const url = await startApp(() => Promise.resolve({ rows: [] }));

    const response = await fetch(`${url}/health`);
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks).toEqual({ api: 'ok', database: 'ok' });
  });

  it('returns 503 with the database marked as error when it is unreachable', async () => {
    const url = await startApp(() => Promise.reject(new Error('connection refused')));

    const response = await fetch(`${url}/health`);
    const body = healthResponseSchema.parse(await response.json());

    expect(response.status).toBe(503);
    expect(body.status).toBe('degraded');
    expect(body.checks).toEqual({ api: 'ok', database: 'error' });
  });

  it('denies routes that do not declare an access rule', async () => {
    const url = await startApp(() => Promise.resolve({ rows: [] }));

    const response = await fetch(`${url}/unmarked`);

    expect(response.status).toBe(401);
  });
});
