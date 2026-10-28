import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { SessionStage } from '@planciait/shared';
import type { ResolvedSession } from '../../auth/session.service.js';
import type { HttpRequest } from '../http.js';

export const SESSION_STAGES_KEY = 'access:session-stages';

/**
 * Lets a route accept sessions that have not completed MFA yet. Without it,
 * every non-public route requires an `authenticated` session.
 */
export const AllowSessionStages = (...stages: SessionStage[]) =>
  SetMetadata(SESSION_STAGES_KEY, stages);

/** The session AccessGuard resolved for this request. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ResolvedSession => {
    const session = context.switchToHttp().getRequest<HttpRequest>().session;
    if (!session) {
      // Only reachable if a route uses the decorator without passing AccessGuard.
      throw new Error('CurrentSession used on a route without a session');
    }
    return session;
  },
);
