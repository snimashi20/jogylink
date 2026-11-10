/** True for a PostgreSQL unique-constraint violation (code 23505), however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (e.code === '23505') return true;
    current = e.cause;
  }
  return false;
}

/** True for a Zod validation error, without depending on both packages sharing one Zod copy. */
export function isZodError(
  err: unknown,
): err is { issues: { path: PropertyKey[]; message: string }[] } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'issues' in err &&
    Array.isArray((err as { issues: unknown }).issues)
  );
}
