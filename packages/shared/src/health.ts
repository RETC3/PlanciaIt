import { z } from 'zod';

export const componentStatusSchema = z.enum(['ok', 'error']);
export type ComponentStatus = z.infer<typeof componentStatusSchema>;

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    api: componentStatusSchema,
    database: componentStatusSchema,
  }),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
