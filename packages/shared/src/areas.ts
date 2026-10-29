import { z } from 'zod';
import { idSchema, userStatusSchema } from './users.js';

/** Unique, case-insensitively. */
export const areaNameSchema = z.string().trim().min(1).max(100);

/** Optional free text; blank is stored as null. */
export const areaDescriptionSchema = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => (value === '' ? null : value))
  .nullable();

/** `read` sees an area's content; `write` can also change it. */
export const areaPermissionSchema = z.enum(['read', 'write']);
export type AreaPermission = z.infer<typeof areaPermissionSchema>;

export const areaSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  /** What the current user may do here; always `write` for administrators. */
  permission: areaPermissionSchema,
  createdAt: z.iso.datetime(),
});
export type AreaSummary = z.infer<typeof areaSummarySchema>;

// GET /areas
export const areaListResponseSchema = z.object({ areas: z.array(areaSummarySchema) });
export type AreaListResponse = z.infer<typeof areaListResponseSchema>;

// GET /areas/:id, POST /areas, PATCH /areas/:id
export const areaResponseSchema = z.object({ area: areaSummarySchema });
export type AreaResponse = z.infer<typeof areaResponseSchema>;

// POST /areas
export const createAreaRequestSchema = z.object({
  name: areaNameSchema,
  description: areaDescriptionSchema.optional(),
});
export type CreateAreaRequest = z.infer<typeof createAreaRequestSchema>;

// PATCH /areas/:id
export const updateAreaRequestSchema = z
  .object({
    name: areaNameSchema.optional(),
    description: areaDescriptionSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field is required',
  });
export type UpdateAreaRequest = z.infer<typeof updateAreaRequestSchema>;

/** Always a technician: administrators see every area without being members. */
export const areaMemberSchema = z.object({
  userId: idSchema,
  username: z.string(),
  displayName: z.string(),
  status: userStatusSchema,
  permission: areaPermissionSchema,
});
export type AreaMember = z.infer<typeof areaMemberSchema>;

// GET /areas/:id/members
export const areaMemberListResponseSchema = z.object({ members: z.array(areaMemberSchema) });
export type AreaMemberListResponse = z.infer<typeof areaMemberListResponseSchema>;

// PUT /areas/:id/members/:userId (adds the member or changes the permission)
export const setAreaMemberRequestSchema = z.object({ permission: areaPermissionSchema });
export type SetAreaMemberRequest = z.infer<typeof setAreaMemberRequestSchema>;
export const areaMemberResponseSchema = z.object({ member: areaMemberSchema });
export type AreaMemberResponse = z.infer<typeof areaMemberResponseSchema>;
