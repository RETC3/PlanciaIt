import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import {
  createAssetTypeRequestSchema,
  idSchema,
  updateAssetTypeRequestSchema,
  type AssetTypeListResponse,
  type AssetTypeResponse,
  type CreateAssetTypeRequest,
  type UpdateAssetTypeRequest,
} from '@planciait/shared';
import type { ResolvedSession } from '../auth/session.service.js';
import { CurrentSession, Roles } from '../common/access/session.decorators.js';
import { clientInfo, type HttpRequest } from '../common/http.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { AssetTypesService } from './asset-types.service.js';

const idPipe = new ZodPipe(idSchema);

@Controller('asset-types')
export class AssetTypesController {
  constructor(private readonly assetTypes: AssetTypesService) {}

  /** Every role: technicians need the types and their fields to edit assets. */
  @Get()
  async list(): Promise<AssetTypeListResponse> {
    return { assetTypes: await this.assetTypes.list() };
  }

  @Get(':id')
  async get(@Param('id', idPipe) id: string): Promise<AssetTypeResponse> {
    return { assetType: await this.assetTypes.get(id) };
  }

  @Post()
  @Roles('admin')
  @HttpCode(201)
  async create(
    @Body(new ZodPipe(createAssetTypeRequestSchema)) body: CreateAssetTypeRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AssetTypeResponse> {
    return { assetType: await this.assetTypes.create(session, body, clientInfo(request)) };
  }

  @Patch(':id')
  @Roles('admin')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateAssetTypeRequestSchema)) body: UpdateAssetTypeRequest,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<AssetTypeResponse> {
    return { assetType: await this.assetTypes.update(session, id, body, clientInfo(request)) };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(
    @Param('id', idPipe) id: string,
    @CurrentSession() session: ResolvedSession,
    @Req() request: HttpRequest,
  ): Promise<void> {
    await this.assetTypes.remove(session, id, clientInfo(request));
  }
}
