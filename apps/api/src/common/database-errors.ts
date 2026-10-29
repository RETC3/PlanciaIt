/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && error.cause !== undefined ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause
    ? cause.code === UNIQUE_VIOLATION
    : false;
}
