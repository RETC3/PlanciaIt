import { Module } from '@nestjs/common';
import { RelationsController } from './relations.controller.js';
import { RelationsService } from './relations.service.js';

@Module({
  controllers: [RelationsController],
  providers: [RelationsService],
})
export class RelationsModule {}
