import { Controller, Get, Query } from '@nestjs/common';
import { searchQuerySchema, type SearchQuery, type SearchResponse } from '@planciait/shared';
import type { ResolvedSession } from '../auth/session.service.js';
import { CurrentSession } from '../common/access/session.decorators.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { SearchService } from './search.service.js';

/**
 * Open to every role behind the session guard; SearchService limits every
 * group of results to the areas the user can read. Searches are not audited:
 * they reveal nothing beyond what the lists already show.
 */
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  async find(
    @Query(new ZodPipe(searchQuerySchema)) query: SearchQuery,
    @CurrentSession() session: ResolvedSession,
  ): Promise<SearchResponse> {
    return this.search.search(session.user, query);
  }
}
