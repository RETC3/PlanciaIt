/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';
/**
 * Postgres foreign_key_violation, and restrict_violation raised instead by
 * ON DELETE RESTRICT: both mean the row is still referenced.
 */
const REFERENCE_VIOLATIONS: unknown[] = ['23503', '23001'];

function postgresCode(error: unknown): unknown {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined;
}

export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === UNIQUE_VIOLATION;
}

export function isForeignKeyViolation(error: unknown): boolean {
  return REFERENCE_VIOLATIONS.includes(postgresCode(error));
}
