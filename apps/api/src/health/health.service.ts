import { Inject, Injectable, Logger } from '@nestjs/common';
import { pingDatabase, type Database } from '@planciait/db';
import type { ComponentStatus, HealthResponse } from '@planciait/shared';
import { DATABASE } from '../database/database.module.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      checks: { api: 'ok', database },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ComponentStatus> {
    try {
      await pingDatabase(this.database.db);
      return 'ok';
    } catch (error) {
      this.logger.warn(`Database health check failed: ${describeError(error)}`);
      return 'error';
    }
  }
}

/**
 * Drizzle wraps driver errors in a message that also contains the query
 * parameters, so only the underlying cause (code or message) is reported.
 */
function describeError(error: unknown): string {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    return typeof code === 'string' ? code : cause.message || cause.name;
  }
  return 'unknown error';
}
