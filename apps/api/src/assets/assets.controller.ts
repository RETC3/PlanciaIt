import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  assetListQuerySchema,
  createAssetRequestSchema,
  idSchema,
  updateAssetRequestSchema,
  type AssetListQuery,
  type AssetListResponse,
  type AssetResponse,
  type CreateAssetRequest,
  type UpdateAssetRequest,
} from '@planciait/shared';
import type { ResolvedSession } from '../auth/session.service.js';
import { CurrentSession } from '../common/access/session.decorators.js';
import { clientInfo, type HttpRequest } from '../common/http.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { AssetsService } from './assets.service.js';

const idPipe = new ZodPipe(idSchema);

/**
 * Open to every role behind the session guard; the area permission is
 * checked by AssetsService, which first has to load the asset to know its area.
 */
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  async list(
    @Query(new ZodPipe(assetListQuerySchema)) query: AssetListQuery,
    @CurrentSession() session: ResolvedSession,
  ): Promise<AssetListResponse> {
    return this.assets.list(session.user, query);
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(createAssetRequestSchema)) body: CreateAssetRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AssetResponse> {
    return { asset: await this.assets.create(session, body, clientInfo(request)) };
  }

  @Get(':id')
  async get(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
  ): Promise<AssetResponse> {
    return { asset: await this.assets.get(session.user, id) };
  }

  @Patch(':id')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateAssetRequestSchema)) body: UpdateAssetRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AssetResponse> {
    return { asset: await this.assets.update(session, id, body, clientInfo(request)) };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<void> {
    await this.assets.remove(session, id, clientInfo(request));
  }
}
