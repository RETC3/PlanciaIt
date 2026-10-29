import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Request body limit. Express defaults to 100 KB; a CSV import of up to
 * ASSET_IMPORT_MAX_ROWS assets needs more. Row counts and field lengths are
 * still bounded by the zod schemas.
 */
const JSON_BODY_LIMIT = '2mb';

/** HTTP settings shared by the real server and the end-to-end test app. */
export function configureHttp(app: NestExpressApplication): void {
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
