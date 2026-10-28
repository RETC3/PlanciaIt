import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database } from '@planciait/db';
import { APP_CONFIG, type AppConfig } from '../config/config.js';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Database => {
        const logger = new Logger('Database');
        return createDatabase(config.databaseUrl, {
          onPoolError: (error) => logger.error(`Idle connection error: ${error.message}`),
        });
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.pool.end();
  }
}
