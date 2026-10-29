/** Any schema with zod's `parse` shape, so callers pass the shared schemas directly. */
export interface Parser<T> {
  parse(value: unknown): T;
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    // The session lives in an HttpOnly cookie, never in JavaScript.
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return response;
}

export async function apiRequest<T>(
  path: string,
  schema: Parser<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  return schema.parse(await response.json());
}

export async function apiRequestNoContent(
  path: string,
  options: RequestOptions = {},
): Promise<void> {
  await send(path, options);
}
