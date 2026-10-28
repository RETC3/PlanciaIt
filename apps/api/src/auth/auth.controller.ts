import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  acceptInvitationRequestSchema,
  inspectInvitationRequestSchema,
  loginRequestSchema,
  mfaConfirmRequestSchema,
  mfaVerifyRequestSchema,
  preloginRequestSchema,
  setupRequestSchema,
  type AcceptInvitationRequest,
  type InspectInvitationRequest,
  type InspectInvitationResponse,
  type LoginRequest,
  type MfaConfirmRequest,
  type MfaConfirmResponse,
  type MfaEnrollmentResponse,
  type MfaVerifyRequest,
  type MfaVerifyResponse,
  type PendingSessionResponse,
  type PreloginRequest,
  type PreloginResponse,
  type SessionResponse,
  type SetupRequest,
  type SetupStatusResponse,
} from '@planciait/shared';
import { Public } from '../common/access/public.decorator.js';
import { AllowSessionStages, CurrentSession } from '../common/access/session.decorators.js';
import {
  clearCookie,
  clientIp,
  readCookie,
  setCookie,
  userAgent,
  type HttpRequest,
  type HttpResponse,
} from '../common/http.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { AuthService, type AuthResult } from './auth.service.js';
import {
  SESSION_COOKIE,
  SessionService,
  type ClientInfo,
  type ResolvedSession,
} from './session.service.js';

function client(request: HttpRequest): ClientInfo {
  return { ipAddress: clientIp(request), userAgent: userAgent(request) };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Get('setup')
  async setupStatus(): Promise<SetupStatusResponse> {
    return { setupRequired: await this.auth.isSetupRequired() };
  }

  @Public()
  @Post('setup')
  @HttpCode(201)
  async setup(
    @Body(new ZodPipe(setupRequestSchema)) body: SetupRequest,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PendingSessionResponse> {
    return this.withSession(response, await this.auth.setup(body, client(request)));
  }

  @Public()
  @Post('invitations/inspect')
  @HttpCode(200)
  async inspectInvitation(
    @Body(new ZodPipe(inspectInvitationRequestSchema)) body: InspectInvitationRequest,
    @Req() request: HttpRequest,
  ): Promise<InspectInvitationResponse> {
    return this.auth.inspectInvitation(body.token, client(request));
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  async acceptInvitation(
    @Body(new ZodPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PendingSessionResponse> {
    const previousToken = readCookie(request, SESSION_COOKIE);
    if (previousToken) {
      await this.sessions.revokeByToken(previousToken);
    }
    return this.withSession(response, await this.auth.acceptInvitation(body, client(request)));
  }

  @Public()
  @Post('prelogin')
  @HttpCode(200)
  async prelogin(
    @Body(new ZodPipe(preloginRequestSchema)) body: PreloginRequest,
    @Req() request: HttpRequest,
  ): Promise<PreloginResponse> {
    return this.auth.prelogin(body.username, client(request));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<PendingSessionResponse> {
    const previousToken = readCookie(request, SESSION_COOKIE);
    if (previousToken) {
      await this.sessions.revokeByToken(previousToken);
    }
    return this.withSession(response, await this.auth.login(body, client(request)));
  }

  @AllowSessionStages('mfa_enrollment')
  @Post('mfa/enrollment')
  @HttpCode(200)
  async startEnrollment(
    @CurrentSession() session: ResolvedSession,
  ): Promise<MfaEnrollmentResponse> {
    return this.auth.startEnrollment(session);
  }

  @AllowSessionStages('mfa_enrollment')
  @Post('mfa/enrollment/confirm')
  @HttpCode(200)
  async confirmEnrollment(
    @Body(new ZodPipe(mfaConfirmRequestSchema)) body: MfaConfirmRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<MfaConfirmResponse> {
    return this.withSession(
      response,
      await this.auth.confirmEnrollment(session, body, client(request)),
    );
  }

  @AllowSessionStages('mfa_verification')
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Body(new ZodPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<MfaVerifyResponse> {
    return this.withSession(response, await this.auth.verifyMfa(session, body, client(request)));
  }

  @AllowSessionStages('mfa_enrollment', 'mfa_verification', 'authenticated')
  @Get('session')
  session(@CurrentSession() session: ResolvedSession): SessionResponse {
    return { stage: session.stage, user: session.user };
  }

  @AllowSessionStages('mfa_enrollment', 'mfa_verification', 'authenticated')
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<void> {
    await this.auth.logout(session, client(request));
    clearCookie(response, SESSION_COOKIE);
  }

  private withSession<T>(response: HttpResponse, result: AuthResult<T>): T {
    setCookie(response, SESSION_COOKIE, result.session.token, {
      maxAgeSeconds: (result.session.expiresAt.getTime() - Date.now()) / 1000,
    });
    return result.body;
  }
}
