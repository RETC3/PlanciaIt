import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'access:public';

/** Marks a route as reachable without authentication. Use sparingly. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
