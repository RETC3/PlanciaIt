import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  createRelationRequestSchema,
  idSchema,
  relationListQuerySchema,
  type CreateRelationRequest,
  type RelationListQuery,
  type RelationListResponse,
  type RelationResponse,
} from '@planciait/shared';
import type { ResolvedSession } from '../auth/session.service.js';
import { CurrentSession } from '../common/access/session.decorators.js';
import { clientInfo, type HttpRequest } from '../common/http.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { RelationsService } from './relations.service.js';

/**
 * Open to every role behind the session guard; RelationsService checks the
 * area permissions of both ends, which it first has to load.
 */
@Controller('relations')
export class RelationsController {
  constructor(private readonly relations: RelationsService) {}

  @Get()
  async list(
    @Query(new ZodPipe(relationListQuerySchema)) query: RelationListQuery,
    @CurrentSession() session: ResolvedSession,
  ): Promise<RelationListResponse> {
    return {
      relations: await this.relations.list(session.user, {
        type: query.elementType,
        id: query.elementId,
      }),
    };
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(createRelationRequestSchema)) body: CreateRelationRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<RelationResponse> {
    return { relation: await this.relations.create(session, body, clientInfo(request)) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<void> {
    await this.relations.remove(session, id, clientInfo(request));
  }
}
