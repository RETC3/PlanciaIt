import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates and normalizes a request body with a shared zod schema.
 * Errors report field paths and messages only, never the submitted values.
 */
@Injectable()
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Invalid request',
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}
