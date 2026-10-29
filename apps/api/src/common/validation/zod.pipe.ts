import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
}

/** A 400 in the same shape as ZodPipe's, for checks that need the database (e.g. custom fields). */
export function invalidRequest(issues: ValidationIssue[]): BadRequestException {
  return new BadRequestException({ message: 'Invalid request', issues });
}

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
      throw invalidRequest(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
