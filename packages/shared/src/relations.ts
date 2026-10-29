import { z } from 'zod';
import { idSchema } from './users.js';

/**
 * Kinds of element a relation can link. Only assets exist so far; credentials,
 * procedures, suppliers and licenses join this list as their modules arrive.
 */
export const elementTypeSchema = z.enum(['asset']);
export type ElementType = z.infer<typeof elementTypeSchema>;

export const elementRefSchema = z.object({ type: elementTypeSchema, id: idSchema });
export type ElementRef = z.infer<typeof elementRefSchema>;

/**
 * What a relation means, read from source to target: "source depends on
 * target", "source runs on target"… Symmetric kinds read the same both ways.
 */
export const relationKindSchema = z.enum([
  'depends_on',
  'runs_on',
  'located_in',
  'backed_up_to',
  'connected_to',
  'related_to',
]);
export type RelationKind = z.infer<typeof relationKindSchema>;

export const symmetricRelationKinds: readonly RelationKind[] = ['connected_to', 'related_to'];

export function isSymmetricRelation(kind: RelationKind): boolean {
  return symmetricRelationKinds.includes(kind);
}

/** The other end of a relation, as seen from one element. */
export const relatedElementSchema = elementRefSchema.extend({
  name: z.string(),
  area: z.object({ id: idSchema, name: z.string() }),
});
export type RelatedElement = z.infer<typeof relatedElementSchema>;

export const relationDirectionSchema = z.enum(['outgoing', 'incoming']);
export type RelationDirection = z.infer<typeof relationDirectionSchema>;

export const relationSchema = z.object({
  id: idSchema,
  kind: relationKindSchema,
  /** outgoing: the element is the source ("depends on"); incoming: the target ("is needed by"). */
  direction: relationDirectionSchema,
  other: relatedElementSchema,
  note: z.string().nullable(),
  /** Whether the current user may delete it: `write` on at least one end. */
  canDelete: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type Relation = z.infer<typeof relationSchema>;

// GET /relations?elementType&elementId
export const relationListQuerySchema = z.object({
  elementType: elementTypeSchema,
  elementId: idSchema,
});
export type RelationListQuery = z.infer<typeof relationListQuerySchema>;

export const relationListResponseSchema = z.object({ relations: z.array(relationSchema) });
export type RelationListResponse = z.infer<typeof relationListResponseSchema>;

// POST /relations. The response describes the relation as seen from the source.
export const createRelationRequestSchema = z
  .object({
    kind: relationKindSchema,
    source: elementRefSchema,
    target: elementRefSchema,
    note: z
      .string()
      .trim()
      .max(500)
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.source.type !== value.target.type || value.source.id !== value.target.id,
    {
      message: 'An element cannot be related to itself',
      path: ['target'],
    },
  );
export type CreateRelationRequest = z.infer<typeof createRelationRequestSchema>;

export const relationResponseSchema = z.object({ relation: relationSchema });
export type RelationResponse = z.infer<typeof relationResponseSchema>;
