import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import {
  createUserRequestSchema,
  idSchema,
  updateUserRequestSchema,
  type CreateUserRequest,
  type InvitationResponse,
  type UpdateUserRequest,
  type UserListResponse,
  type UserResponse,
} from '@planciait/shared';
import { CurrentSession, Roles } from '../common/access/session.decorators.js';
import { clientInfo, type HttpRequest } from '../common/http.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import type { ResolvedSession } from '../auth/session.service.js';
import { UsersService } from './users.service.js';

const idPipe = new ZodPipe(idSchema);

@Roles('admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(): Promise<UserListResponse> {
    return { users: await this.users.list() };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(createUserRequestSchema)) body: CreateUserRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<InvitationResponse> {
    return this.users.create(session, body, clientInfo(request));
  }

  @Get(':id')
  async get(@Param('id', idPipe) id: string): Promise<UserResponse> {
    return { user: await this.users.get(id) };
  }

  @Patch(':id')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateUserRequestSchema)) body: UpdateUserRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<UserResponse> {
    return { user: await this.users.update(session, id, body, clientInfo(request)) };
  }

  @Post(':id/invitation')
  @HttpCode(200)
  async reissueInvitation(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<InvitationResponse> {
    return this.users.reissueInvitation(session, id, clientInfo(request));
  }

  @Post(':id/mfa-reset')
  @HttpCode(200)
  async resetMfa(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<UserResponse> {
    return { user: await this.users.resetMfa(session, id, clientInfo(request)) };
  }
}
