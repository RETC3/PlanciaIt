import { Module } from '@nestjs/common';
import { AssetTypesModule } from '../asset-types/asset-types.module.js';
import { AssetsController } from './assets.controller.js';
import { AssetsService } from './assets.service.js';

@Module({
  imports: [AssetTypesModule],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}
