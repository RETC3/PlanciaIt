import {
  isSymmetricRelation,
  relationKindSchema,
  type RelationDirection,
  type RelationKind,
} from '@planciait/shared';

/** A relation kind read from the current element: "depends on" or "is needed by". */
export interface KindChoice {
  value: `${RelationKind}:${RelationDirection}`;
  kind: RelationKind;
  direction: RelationDirection;
}

/** Both readings of each directed kind, one of each symmetric kind. */
export const kindChoices: KindChoice[] = relationKindSchema.options.flatMap((kind) =>
  (isSymmetricRelation(kind) ? ['outgoing' as const] : (['outgoing', 'incoming'] as const)).map(
    (direction) => ({ value: `${kind}:${direction}` as const, kind, direction }),
  ),
);
