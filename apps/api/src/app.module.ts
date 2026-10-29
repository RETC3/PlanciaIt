import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AreasModule } from './areas/areas.module.js';
import { AssetTypesModule } from './asset-types/asset-types.module.js';
import { AssetsModule } from './assets/assets.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccessGuard } from './common/access/access.guard.js';
import { AccessModule } from './common/access/access.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { RelationsModule } from './relations/relations.module.js';
import { SearchModule } from './search/search.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    AccessModule,
    AuthModule,
    UsersModule,
    AreasModule,
    AssetTypesModule,
    AssetsModule,
    RelationsModule,
    SearchModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
