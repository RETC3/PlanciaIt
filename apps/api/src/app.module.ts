import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccessGuard } from './common/access/access.guard.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [ConfigModule, DatabaseModule, HealthModule],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
