/** Calls the API through the web app's own /backend route (which adds the login). Browser side. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function callApi<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/backend${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  if (res.status === 401 && typeof window !== 'undefined') window.location.assign('/login');
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: unknown };
    throw new ApiError(res.status, typeof data.message === 'string' ? data.message : '');
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}
