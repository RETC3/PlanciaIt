import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionStage } from '@planciait/shared';
import { SESSION_COOKIE, SessionService } from '../../auth/session.service.js';
import { readCookie, type HttpRequest } from '../http.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { SESSION_STAGES_KEY } from './session.decorators.js';

/**
 * Global deny-by-default guard. A route is reachable only if it is marked
 * @Public() or the request carries a valid session cookie whose stage the
 * route accepts (default: `authenticated`, i.e. password and MFA completed).
 * Role and area permissions will extend this guard in the next Phase 0 steps.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = readCookie(request, SESSION_COOKIE);
    const session = token ? await this.sessions.resolve(token) : null;
    const allowedStages = this.reflector.getAllAndOverride<SessionStage[] | undefined>(
      SESSION_STAGES_KEY,
      targets,
    ) ?? ['authenticated'];
    if (!session || !allowedStages.includes(session.stage)) {
      throw new UnauthorizedException();
    }

    request.session = session;
    return true;
  }
}
