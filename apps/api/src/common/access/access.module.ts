import { Global, Module } from '@nestjs/common';
import { AreaAccessService } from './area-access.service.js';

/** Permission checks shared by the global AccessGuard and every area-scoped module. */
@Global()
@Module({
  providers: [AreaAccessService],
  exports: [AreaAccessService],
})
export class AccessModule {}
