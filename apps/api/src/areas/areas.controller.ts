import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  createAreaRequestSchema,
  idSchema,
  setAreaMemberRequestSchema,
  updateAreaRequestSchema,
  type AreaListResponse,
  type AreaMemberListResponse,
  type AreaMemberResponse,
  type AreaResponse,
  type CreateAreaRequest,
  type SetAreaMemberRequest,
  type UpdateAreaRequest,
} from '@planciait/shared';
import type { ResolvedSession } from '../auth/session.service.js';
import { AreaAccess } from '../common/access/area-access.decorator.js';
import { CurrentSession, Roles } from '../common/access/session.decorators.js';
import { clientInfo, type HttpRequest } from '../common/http.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { AreasService } from './areas.service.js';

const idPipe = new ZodPipe(idSchema);

@Controller('areas')
export class AreasController {
  constructor(private readonly areas: AreasService) {}

  /** Open to every role: the service returns only the areas the user can see. */
  @Get()
  async list(@CurrentSession() session: ResolvedSession): Promise<AreaListResponse> {
    return { areas: await this.areas.list(session.user) };
  }

  @Post()
  @Roles('admin')
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(createAreaRequestSchema)) body: CreateAreaRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AreaResponse> {
    return { area: await this.areas.create(session, body, clientInfo(request)) };
  }

  @Get(':id')
  @AreaAccess('read')
  async get(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
  ): Promise<AreaResponse> {
    return { area: await this.areas.get(session.user, id) };
  }

  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateAreaRequestSchema)) body: UpdateAreaRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AreaResponse> {
    return { area: await this.areas.update(session, id, body, clientInfo(request)) };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<void> {
    await this.areas.remove(session, id, clientInfo(request));
  }

  @Get(':id/members')
  @Roles('admin')
  async listMembers(@Param('id', idPipe) id: string): Promise<AreaMemberListResponse> {
    return { members: await this.areas.listMembers(id) };
  }

  @Put(':id/members/:userId')
  @Roles('admin')
  async setMember(
    @Param('id', idPipe) id: string,
    @Param('userId', idPipe) userId: string,
    @Body(new ZodPipe(setAreaMemberRequestSchema)) body: SetAreaMemberRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AreaMemberResponse> {
    return {
      member: await this.areas.setMember(session, id, userId, body.permission, clientInfo(request)),
    };
  }

  @Delete(':id/members/:userId')
  @Roles('admin')
  @HttpCode(204)
  async removeMember(
    @Param('id', idPipe) id: string,
    @Param('userId', idPipe) userId: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<void> {
    await this.areas.removeMember(session, id, userId, clientInfo(request));
  }
}
