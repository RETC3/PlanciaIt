import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { serverKeysProvider } from './server-keys.js';
import { SessionService } from './session.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, LoginThrottleService, serverKeysProvider],
  // SessionService is used by the global AccessGuard.
  exports: [SessionService],
})
export class AuthModule {}
