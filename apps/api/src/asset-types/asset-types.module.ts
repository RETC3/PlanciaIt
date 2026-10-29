import { Module } from '@nestjs/common';
import { AssetTypesController } from './asset-types.controller.js';
import { AssetTypesService } from './asset-types.service.js';

@Module({
  controllers: [AssetTypesController],
  providers: [AssetTypesService],
  // Used by the assets module to validate custom fields.
  exports: [AssetTypesService],
})
export class AssetTypesModule {}
