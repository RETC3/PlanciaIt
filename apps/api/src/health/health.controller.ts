import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@planciait/shared';
import { Public } from '../common/access/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** 200 when every component is healthy, 503 (same body) otherwise. */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const result = await this.healthService.check();
    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
