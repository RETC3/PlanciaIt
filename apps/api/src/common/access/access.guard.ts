import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { idSchema, type SessionStage, type UserRole } from '@planciait/shared';
import { SESSION_COOKIE, SessionService } from '../../auth/session.service.js';
import { readCookie, type HttpRequest } from '../http.js';
import { AREA_ACCESS_KEY, type AreaAccessRequirement } from './area-access.decorator.js';
import { AreaAccessService } from './area-access.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY, SESSION_STAGES_KEY } from './session.decorators.js';

/**
 * Global deny-by-default guard. A route is reachable only if it is marked
 * @Public() or the request carries a valid session cookie whose stage the
 * route accepts (default: `authenticated`, i.e. password and MFA completed).
 * @Roles() further restricts a route to some roles (403 otherwise).
 * @AreaAccess() requires a permission on the area named by a route parameter.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly areas: AreaAccessService,
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

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(session.user.role)) {
      throw new ForbiddenException();
    }

    const areaAccess = this.reflector.getAllAndOverride<AreaAccessRequirement | undefined>(
      AREA_ACCESS_KEY,
      targets,
    );
    if (areaAccess) {
      const areaId = idSchema.safeParse(request.params?.[areaAccess.param]);
      if (!areaId.success) throw new BadRequestException('Invalid area id');
      await this.areas.require(session.user, areaId.data, areaAccess.permission);
    }

    request.session = session;
    return true;
  }
}
