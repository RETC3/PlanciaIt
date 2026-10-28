import { healthResponseSchema, type HealthResponse } from '@planciait/shared';

export const healthQueryKey = ['health'] as const;

/** The API answers 503 with the same body when a component is down. */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', { headers: { Accept: 'application/json' } });
  if (!response.ok && response.status !== 503) {
    throw new Error(`Unexpected health status ${response.status}`);
  }
  return healthResponseSchema.parse(await response.json());
}
